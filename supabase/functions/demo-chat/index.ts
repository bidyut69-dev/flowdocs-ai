// demo-chat: the simulator's backend. Same brain as live (conversation.ts + agent.ts),
// DemoChannel instead of WhatsApp. Only works for orgs whose status is 'demo'.
//
// POST { action: "org", slug }                    → public demo info for the lead form
// POST { action: "submit_lead", slug, name, phone, consent: true } → creates/resets the lead, sends first reply
// POST { action: "send", lead_id, text }           → lead message in, AI reply / handoff / opt-out out

import { DemoChannel, type OwnerAlert } from "../_shared/channel.ts";
import { type Ctx, handleInbound, intakeLead, projectOf } from "../_shared/conversation.ts";
import { loadOrg, logEvent, must } from "../_shared/db.ts";
import { CORS_HEADERS, json } from "../_shared/http.ts";
import { normalizePhone } from "../_shared/phone.ts";
import { type Db, supabaseAdmin } from "../_shared/supabaseAdmin.ts";
import type { Lead, MessageRow } from "../_shared/types.ts";

const MAX_TEXT = 1000;
const MAX_INTAKES_PER_HOUR = 60; // per demo org
const MAX_MESSAGES_PER_10_MIN = 30; // per lead
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const publicLead = (l: Lead) => ({
  id: l.id,
  name: l.name,
  status: l.status,
  score: l.score,
  ai_paused: l.ai_paused,
  qualification: l.qualification,
});

const publicMessage = (m: MessageRow) => ({
  id: m.id,
  direction: m.direction,
  sender: m.sender,
  body: m.body,
  template_name: m.template_name,
  created_at: m.created_at,
});

function payload(channel: DemoChannel, lead: Lead, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    lead: publicLead(lead),
    messages: channel.outbox.map(publicMessage),
    alerts: channel.alerts satisfies OwnerAlert[],
  };
}

async function countSince(db: Db, table: string, filters: Record<string, string>, sinceMs: number, inList?: [string, string[]]) {
  let q = db.from(table).select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
  if (inList) q = q.in(inList[0], inList[1]);
  const { count, error } = await q;
  if (error) throw new Error(`rate count: ${error.message}`);
  return count ?? 0;
}

/** Re-submitting the form with the same phone starts a fresh demo conversation. */
async function resetDemoLead(db: Db, lead: Lead) {
  must(await db.from("messages").delete().eq("lead_id", lead.id).select("id"), "reset messages");
  must(await db.from("followup_jobs").delete().eq("lead_id", lead.id).select("id"), "reset followups");
  must(
    await db.from("appointments").update({ status: "cancelled" }).eq("lead_id", lead.id).eq("status", "booked").select("id"),
    "reset appointments",
  );
  must(
    await db.from("leads").update({
      status: "new",
      score: 0,
      ai_paused: false,
      qualification: {},
      unclear_count: 0,
      first_response_at: null,
      last_inbound_at: null,
      created_at: new Date().toISOString(),
    }).eq("id", lead.id).select("id"),
    "reset lead",
  );
  await logEvent(db, lead.org_id, lead.id, "demo_reset");
}

async function handle(body: Record<string, unknown>): Promise<Response> {
  const db = supabaseAdmin;

  switch (body.action) {
    case "org": {
      const found = await loadOrg(db, { slug: String(body.slug ?? "") });
      if (!found || found.org.status !== "demo") return json({ error: "demo org not found" }, 404);
      const { org, config } = found;
      return json({
        slug: org.slug,
        name: config.business_name,
        niche: org.niche,
        city: config.city,
        project: config.services[0]?.name ?? config.business_name,
        project_details: config.services[0]?.details ?? null,
      });
    }

    case "submit_lead": {
      const found = await loadOrg(db, { slug: String(body.slug ?? "") });
      if (!found || found.org.status !== "demo") return json({ error: "demo org not found" }, 404);
      const name = String(body.name ?? "").trim().slice(0, 80);
      const phone = String(body.phone ?? "").trim().slice(0, 20);
      if (!name || !phone) return json({ error: "name and phone are required" }, 400);
      if (body.consent !== true) return json({ error: "WhatsApp contact ke liye consent tick karein", field: "consent" }, 400);

      const recent = await countSince(db, "events", { org_id: found.org.id }, 3_600_000,
        ["type", ["lead_created", "lead_resubmitted"]]);
      if (recent >= MAX_INTAKES_PER_HOUR) return json({ error: "Demo limit reached, try again later" }, 429);

      const e164 = normalizePhone(phone);
      if (e164) {
        const existing = (await db.from("leads").select("*").eq("org_id", found.org.id).eq("phone", e164).maybeSingle())
          .data as Lead | null;
        if (existing) await resetDemoLead(db, existing);
      }

      const channel = new DemoChannel(db);
      const ctx: Ctx = { db, channel, ...found };
      const { lead, sent } = await intakeLead(ctx, {
        name,
        phone,
        source: "demo",
        campaign: "Demo lead form",
        project: found.config.services[0]?.name ?? null,
        raw: { form: "demo_simulator", consent_at: new Date().toISOString() },
      });
      return json(payload(channel, lead, { sent, project: projectOf(lead, found.config) }));
    }

    case "send": {
      const leadId = String(body.lead_id ?? "");
      const text = String(body.text ?? "").trim();
      if (!UUID_RE.test(leadId)) return json({ error: "lead_id required" }, 400);
      if (!text || text.length > MAX_TEXT) return json({ error: `text must be 1-${MAX_TEXT} characters` }, 400);

      const lead = (await db.from("leads").select("*").eq("id", leadId).maybeSingle()).data as Lead | null;
      if (!lead) return json({ error: "lead not found" }, 404);
      const found = await loadOrg(db, { id: lead.org_id });
      if (!found || found.org.status !== "demo") return json({ error: "lead not found" }, 404);

      const recent = await countSince(db, "messages", { lead_id: lead.id, direction: "in" }, 600_000);
      if (recent >= MAX_MESSAGES_PER_10_MIN) return json({ error: "Thoda slow karein, demo limit" }, 429);

      const channel = new DemoChannel(db);
      const ctx: Ctx = { db, channel, ...found };
      const { outcome, lead: updated } = await handleInbound(ctx, lead, text);
      return json(payload(channel, updated, { outcome }));
    }

    default:
      return json({ error: "unknown action" }, 400);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  try {
    return await handle(body);
  } catch (err) {
    console.error("demo-chat error:", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
