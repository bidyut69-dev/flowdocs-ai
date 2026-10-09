// Conversation orchestration shared by demo-chat (Phase 1) and the WhatsApp webhooks (Phase 2).
// Flows: CLAUDE.md §5.1–5.2, SYSTEM_DESIGN §4–7.

import type Anthropic from "@anthropic-ai/sdk";
import { AgentError, runAgent, type ToolHandlers, type ToolOutcome } from "./agent.ts";
import type { Channel } from "./channel.ts";
import { approvedTemplate, cancelPendingFollowups, DbError, logEvent, must } from "./db.ts";
import { isOptOut } from "./optout.ts";
import { normalizePhone } from "./phone.ts";
import { buildLeadIntro, buildSystemPrompt, buildTurnState } from "./prompts.ts";
import { nextStatus, scoreLead } from "./scoring.ts";
import { computeSlots } from "./slots.ts";
import type { Db } from "./supabaseAdmin.ts";
import { formatOptOutAlert, formatOwnerAlert, renderGreeting } from "./templates.ts";
import { addIstDays, formatIstClock, formatIstDay, istDate, istTime, istToUtc } from "./time.ts";
import type { Lead, LeadSource, MessageRow, Organization, OrgConfig, Qualification } from "./types.ts";

const HISTORY_LIMIT = 20;
const BOOKING_WINDOW_DAYS = 14;
const UNCLEAR_LIMIT = 3;
// Used only when an org has no approved handoff_ack template (logged as template_missing).
const HANDOFF_ACK_FALLBACK = "Main aapko abhi team se connect karta hoon, thoda wait karein.";

export interface Ctx {
  db: Db;
  channel: Channel;
  org: Organization;
  config: OrgConfig;
  now?: () => Date;
}

const nowOf = (ctx: Ctx) => (ctx.now ? ctx.now() : new Date());

async function updateLead(ctx: Ctx, leadId: string, patch: Partial<Lead>): Promise<Lead> {
  return must(
    await ctx.db.from("leads").update(patch).eq("id", leadId).select().single(),
    "update lead",
  ) as Lead;
}

export function projectOf(lead: Lead, config: OrgConfig): string {
  const p = lead.raw?.project;
  return typeof p === "string" && p.trim() ? p.trim() : (lead.campaign || config.services[0]?.name || config.business_name);
}

// ─────────────────────────────────────────────────────────────
// 5.1 Lead intake
// ─────────────────────────────────────────────────────────────

export interface IntakeInput {
  name: string | null;
  phone: string;
  email?: string | null;
  source: LeadSource;
  campaign?: string | null;
  project?: string | null;
  raw?: Record<string, unknown>;
}

export async function intakeLead(ctx: Ctx, input: IntakeInput): Promise<{ lead: Lead; sent: boolean }> {
  const { db, org, config, channel } = ctx;
  const raw = { ...(input.raw ?? {}), project: input.project ?? null };
  const phone = normalizePhone(input.phone);

  if (!phone) {
    const lead = must(
      await db
        .from("leads")
        .upsert(
          {
            org_id: org.id,
            name: input.name,
            phone: input.phone.trim() || "unknown",
            email: input.email ?? null,
            source: input.source,
            campaign: input.campaign ?? null,
            raw,
            status: "invalid_phone",
          },
          { onConflict: "org_id,phone" },
        )
        .select()
        .single(),
      "upsert invalid-phone lead",
    ) as Lead;
    await logEvent(db, org.id, lead.id, "lead_invalid_phone", { input_phone: input.phone, source: input.source });
    await channel.notifyOwner(config, lead.id, "invalid_phone",
      formatOwnerAlert("invalid_phone", lead, config.qualification_questions));
    return { lead, sent: false };
  }

  const existing = (await db.from("leads").select("*").eq("org_id", org.id).eq("phone", phone).maybeSingle()).data as
    | Lead
    | null;

  const lead = must(
    await db
      .from("leads")
      .upsert(
        {
          org_id: org.id,
          name: input.name ?? existing?.name ?? null,
          phone,
          email: input.email ?? existing?.email ?? null,
          source: input.source,
          campaign: input.campaign ?? existing?.campaign ?? null,
          raw,
        },
        { onConflict: "org_id,phone" },
      )
      .select()
      .single(),
    "upsert lead",
  ) as Lead;

  await logEvent(db, org.id, lead.id, existing ? "lead_resubmitted" : "lead_created", {
    source: input.source,
    campaign: input.campaign ?? null,
  });

  if (lead.status === "opted_out") {
    await logEvent(db, org.id, lead.id, "intake_skipped_opted_out");
    return { lead, sent: false };
  }

  const template = await approvedTemplate(db, org.id, "first_reply");
  if (!template) {
    await logEvent(db, org.id, lead.id, "template_missing", { use_case: "first_reply" });
    await channel.notifyOwner(config, lead.id, "template_missing",
      `First reply template approved nahi hai. ${lead.name || lead.phone} ko message nahi gaya.`);
    return { lead, sent: false };
  }

  const body = renderGreeting(config, lead, projectOf(lead, config));
  await channel.send(lead, { body, sender: "system", templateName: template.name });

  const now = nowOf(ctx);
  const updated = await updateLead(ctx, lead.id, {
    first_response_at: lead.first_response_at ?? now.toISOString(),
    status: lead.status === "new" ? "contacted" : lead.status,
  });
  await logEvent(db, org.id, lead.id, "first_reply_sent", {
    template: template.name,
    latency_ms: now.getTime() - new Date(lead.created_at).getTime(),
  });

  await channel.notifyOwner(config, lead.id, "new_lead",
    formatOwnerAlert("new_lead", updated, config.qualification_questions));

  return { lead: updated, sent: true };
}

// ─────────────────────────────────────────────────────────────
// Handoff / opt-out (terminal actions)
// ─────────────────────────────────────────────────────────────

export async function handOff(ctx: Ctx, lead: Lead, category: string, reason: string): Promise<Lead> {
  const { db, org, config, channel } = ctx;
  const updated = await updateLead(ctx, lead.id, { ai_paused: true });
  await logEvent(db, org.id, lead.id, "handoff", { category, reason });

  const template = await approvedTemplate(db, org.id, "handoff_ack");
  if (!template?.body) await logEvent(db, org.id, lead.id, "template_missing", { use_case: "handoff_ack" });
  await channel.send(updated, {
    body: template?.body || HANDOFF_ACK_FALLBACK,
    sender: "system",
    templateName: template?.name ?? null,
  });

  await channel.notifyOwner(config, lead.id, "handoff",
    formatOwnerAlert("handoff", updated, config.qualification_questions, { reason: `${category}: ${reason}` }));
  return updated;
}

export async function optOut(ctx: Ctx, lead: Lead, via: "keyword" | "ai"): Promise<Lead> {
  const { db, org, config, channel } = ctx;
  const updated = await updateLead(ctx, lead.id, { status: "opted_out" });
  const cancelled = await cancelPendingFollowups(db, lead.id);
  await logEvent(db, org.id, lead.id, "opted_out", { via, followups_cancelled: cancelled });
  await channel.notifyOwner(config, lead.id, "opt_out", formatOptOutAlert(updated));
  return updated;
}

// ─────────────────────────────────────────────────────────────
// Agent tools
// ─────────────────────────────────────────────────────────────

interface TurnState {
  lead: Lead;
  handoff?: { category: string; reason: string };
}

const SLOT_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})$/;

async function bookedRanges(ctx: Ctx, date: string, excludeLeadId?: string) {
  const dayStart = istToUtc(date, "00:00")!;
  const dayEnd = new Date(dayStart.getTime() + 86_400_000);
  let q = ctx.db
    .from("appointments")
    .select("starts_at, ends_at, lead_id")
    .eq("org_id", ctx.org.id)
    .eq("status", "booked")
    .lt("starts_at", dayEnd.toISOString())
    .gt("ends_at", dayStart.toISOString());
  if (excludeLeadId) q = q.neq("lead_id", excludeLeadId);
  const rows = must(await q, "load appointments") as { starts_at: string; ends_at: string }[];
  return rows.map((r) => ({ starts_at: new Date(r.starts_at), ends_at: new Date(r.ends_at) }));
}

async function openSlots(ctx: Ctx, date: string, excludeLeadId?: string) {
  return computeSlots({
    date,
    bookingHours: ctx.config.booking_hours,
    slotMinutes: ctx.config.slot_minutes,
    booked: await bookedRanges(ctx, date, excludeLeadId),
    now: nowOf(ctx),
  });
}

function dateInWindow(ctx: Ctx, date: string): boolean {
  if (!istToUtc(date, "12:00")) return false;
  const today = istDate(nowOf(ctx));
  return date >= today && date <= addIstDays(today, BOOKING_WINDOW_DAYS);
}

function makeHandlers(ctx: Ctx, state: TurnState): ToolHandlers {
  const { db, org, config, channel } = ctx;

  return {
    async get_available_slots(input): Promise<ToolOutcome> {
      const date = String(input.date ?? "");
      if (!dateInWindow(ctx, date)) {
        return { result: { error: `date must be YYYY-MM-DD within the next ${BOOKING_WINDOW_DAYS} days` }, isError: true };
      }
      const slots = await openSlots(ctx, date, state.lead.id);
      await logEvent(db, org.id, state.lead.id, "slots_checked", { date, count: slots.length });
      return {
        result: {
          date,
          day: formatIstDay(istToUtc(date, "12:00")!),
          slots: slots.map((s) => ({ value: `${date} ${istTime(s.starts_at)}`, label: formatIstClock(s.starts_at) })),
          ...(slots.length ? {} : { note: "No open slots that day. Offer another day." }),
        },
      };
    },

    async book_appointment(input): Promise<ToolOutcome> {
      const m = SLOT_RE.exec(String(input.starts_at ?? ""));
      if (!m || !dateInWindow(ctx, m[1])) {
        return { result: { ok: false, reason: 'starts_at must be a slot value like "2026-10-10 11:00"' }, isError: true };
      }
      const [, date, time] = m;
      const slots = await openSlots(ctx, date, state.lead.id);
      const slot = slots.find((s) => istTime(s.starts_at) === time);
      const alternatives = slots.slice(0, 3).map((s) => `${date} ${istTime(s.starts_at)}`);
      if (!slot) return { result: { ok: false, reason: "not_available", alternatives } };

      const previous = must(
        await db.from("appointments").select("id, starts_at").eq("lead_id", state.lead.id).eq("status", "booked"),
        "load lead appointments",
      ) as { id: string; starts_at: string }[];
      const sameSlot = previous.find((p) => new Date(p.starts_at).getTime() === slot.starts_at.getTime());

      if (!sameSlot) {
        // Insert first so a failed booking never loses the lead's existing one.
        const ins = await db.from("appointments").insert({
          org_id: org.id,
          lead_id: state.lead.id,
          starts_at: slot.starts_at.toISOString(),
          ends_at: slot.ends_at.toISOString(),
          status: "booked",
          notes: typeof input.notes === "string" ? input.notes.slice(0, 300) : null,
        });
        if (ins.error?.code === "23P01") {
          await logEvent(db, org.id, state.lead.id, "booking_conflict", { starts_at: slot.starts_at.toISOString() });
          return { result: { ok: false, reason: "slot_just_taken", alternatives: alternatives.filter((a) => a !== `${date} ${time}`) } };
        }
        if (ins.error) throw new DbError(`insert appointment: ${ins.error.message}`, ins.error.code);

        if (previous.length) {
          await db.from("appointments").update({ status: "cancelled" }).in("id", previous.map((p) => p.id));
          await logEvent(db, org.id, state.lead.id, "appointment_rescheduled", { cancelled: previous.map((p) => p.id) });
        }
      }

      const visitLabel = `${formatIstDay(slot.starts_at)}, ${formatIstClock(slot.starts_at)}`;
      state.lead = await updateLead(ctx, state.lead.id, {
        status: state.lead.status === "won" ? "won" : "booked",
        qualification: { ...state.lead.qualification, visit_slot: visitLabel },
      });
      await logEvent(db, org.id, state.lead.id, "appointment_booked", { starts_at: slot.starts_at.toISOString() });
      await channel.notifyOwner(config, state.lead.id, "visit_booked",
        formatOwnerAlert("visit_booked", state.lead, config.qualification_questions, { visitAt: slot.starts_at }));

      return {
        result: {
          ok: true,
          date: formatIstDay(slot.starts_at),
          time: formatIstClock(slot.starts_at),
          location: config.project_address,
          tell_lead: "Confirm the date, time and location, and say our team will meet them there.",
        },
      };
    },

    async update_lead(input): Promise<ToolOutcome> {
      const keys = new Set(config.qualification_questions.map((q) => q.key));
      const answers: Record<string, string> = {};
      if (input.answers && typeof input.answers === "object") {
        for (const [k, v] of Object.entries(input.answers as Record<string, unknown>)) {
          if (keys.has(k) && typeof v === "string" && v.trim()) answers[k] = v.trim().slice(0, 200);
        }
      }
      const num = (v: unknown, max: number) =>
        typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : undefined;

      const prev = state.lead.qualification ?? {};
      const q: Qualification = {
        ...prev,
        answers: { ...(prev.answers ?? {}), ...answers },
      };
      const bMin = num(input.budget_min_inr, 1e10);
      const bMax = num(input.budget_max_inr, 1e10);
      const tl = num(input.timeline_months, 120);
      if (bMin !== undefined) q.budget_min_inr = bMin;
      if (bMax !== undefined) q.budget_max_inr = bMax;
      if (tl !== undefined) q.timeline_months = tl;
      if (typeof input.summary === "string" && input.summary.trim()) q.summary = input.summary.trim().slice(0, 200);

      const score = scoreLead(q, config.qualification_questions, config.budget_ranges);
      const status = nextStatus(state.lead.status, score.qualified);
      const before = state.lead.status;
      state.lead = await updateLead(ctx, state.lead.id, { qualification: q, score: score.score, status, unclear_count: 0 });

      await logEvent(db, org.id, state.lead.id, "lead_updated", { answers, score: score.score, status });
      if (status !== before) await logEvent(db, org.id, state.lead.id, "lead_status_changed", { from: before, to: status });

      return { result: { saved: true, status, score: score.score, still_to_ask: score.missing } };
    },

    handoff_to_human(input): Promise<ToolOutcome> {
      state.handoff = {
        category: String(input.category ?? "other"),
        reason: String(input.reason ?? "").slice(0, 200) || "No reason given",
      };
      return Promise.resolve({ result: { ok: true }, terminal: "handoff" });
    },

    async mark_unclear(): Promise<ToolOutcome> {
      const count = state.lead.unclear_count + 1;
      state.lead = await updateLead(ctx, state.lead.id, { unclear_count: count });
      await logEvent(db, org.id, state.lead.id, "unclear", { count });
      if (count >= UNCLEAR_LIMIT) {
        state.handoff = { category: "unclear", reason: `Bot ${count} baar lead ka message samajh nahi paaya` };
        return { result: { ok: true }, terminal: "handoff" };
      }
      return { result: { count, limit: UNCLEAR_LIMIT } };
    },

    opt_out(): Promise<ToolOutcome> {
      return Promise.resolve({ result: { ok: true }, terminal: "opt_out" });
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 5.2 Inbound message → AI agent
// ─────────────────────────────────────────────────────────────

export type InboundOutcome = "replied" | "handoff" | "opted_out" | "paused" | "ignored" | "duplicate" | "ai_error";

function toAgentMessages(lead: Lead, config: OrgConfig, history: MessageRow[], turnState: string): Anthropic.MessageParam[] {
  const turns: { role: "user" | "assistant"; text: string }[] = [
    { role: "user", text: buildLeadIntro(lead, projectOf(lead, config)) },
  ];
  for (const m of history) {
    const role = m.direction === "in" ? "user" : "assistant";
    const last = turns[turns.length - 1];
    if (last.role === role) last.text += `\n${m.body}`;
    else turns.push({ role, text: m.body });
  }

  return turns.map((t, i) => {
    const isLast = i === turns.length - 1;
    if (isLast && t.role === "user") {
      return { role: "user", content: [{ type: "text", text: t.text }, { type: "text", text: turnState }] };
    }
    return { role: t.role, content: t.text };
  });
}

export async function handleInbound(
  ctx: Ctx,
  lead: Lead,
  text: string,
  opts: { waMessageId?: string | null } = {},
): Promise<{ outcome: InboundOutcome; lead: Lead }> {
  const { db, org, config, channel } = ctx;
  const now = nowOf(ctx);

  const ins = await db.from("messages").insert({
    org_id: org.id,
    lead_id: lead.id,
    direction: "in",
    sender: "lead",
    body: text,
    wa_message_id: opts.waMessageId ?? null,
    status: "received",
  });
  if (ins.error?.code === "23505") return { outcome: "duplicate", lead }; // webhook retry
  if (ins.error) throw new DbError(`insert inbound: ${ins.error.message}`, ins.error.code);

  lead = await updateLead(ctx, lead.id, { last_inbound_at: now.toISOString() });
  const cancelled = await cancelPendingFollowups(db, lead.id);
  await logEvent(db, org.id, lead.id, "message_in", { followups_cancelled: cancelled });

  if (lead.status === "opted_out") {
    await logEvent(db, org.id, lead.id, "inbound_after_opt_out");
    return { outcome: "ignored", lead };
  }
  if (isOptOut(text)) return { outcome: "opted_out", lead: await optOut(ctx, lead, "keyword") };
  if (lead.ai_paused) {
    await logEvent(db, org.id, lead.id, "ai_paused_skip");
    return { outcome: "paused", lead };
  }

  const history = (must(
    await db
      .from("messages")
      .select("*")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT),
    "load history",
  ) as MessageRow[]).reverse();

  const score = scoreLead(lead.qualification ?? {}, config.qualification_questions, config.budget_ranges);
  const state: TurnState = { lead };
  const messages = toAgentMessages(lead, config, history, buildTurnState(lead, score, now));

  try {
    const result = await runAgent({ system: buildSystemPrompt(config), messages, handlers: makeHandlers(ctx, state) });

    if (result.terminal === "opt_out") return { outcome: "opted_out", lead: await optOut(ctx, state.lead, "ai") };
    if (result.terminal === "handoff") {
      const h = state.handoff ?? { category: "other", reason: "handoff" };
      return { outcome: "handoff", lead: await handOff(ctx, state.lead, h.category, h.reason) };
    }

    await channel.send(state.lead, { body: result.reply!, sender: "ai" });
    await logEvent(db, org.id, lead.id, "ai_reply", { tools: result.toolCalls.map((t) => t.name) });
    return { outcome: "replied", lead: state.lead };
  } catch (err) {
    if (!(err instanceof AgentError)) throw err;
    // SYSTEM_DESIGN §7: one retry already happened inside the agent. Tell the lead the team will reply,
    // pause the AI, alert the owner.
    await logEvent(db, org.id, lead.id, "ai_error", { kind: err.kind, message: err.message });
    return { outcome: "ai_error", lead: await handOff(ctx, state.lead, "ai_error", err.message.slice(0, 150)) };
  }
}
