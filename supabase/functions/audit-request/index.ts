// audit-request: public endpoint behind flowdocs.co.in/audit.
// Saves the request, then emails the founder via Resend when RESEND_API_KEY + AUDIT_NOTIFY_TO are set.
// The row is saved first, so a failed or unconfigured email never loses a request.
//
// POST { name, business_name, phone, email?, city?, niche, monthly_leads, message?, consent: true, source?, website? }

import { formatAuditEmail, isHoneypotFilled, validateAuditRequest } from "../_shared/auditRequest.ts";
import { CORS_HEADERS, json } from "../_shared/http.ts";
import { supabaseAdmin } from "../_shared/supabaseAdmin.ts";

const MAX_PER_PHONE_PER_DAY = 3;
const MAX_PER_HOUR = 30;

async function recentCount(column: string | null, value: string | null, sinceMs: number): Promise<number> {
  let q = supabaseAdmin
    .from("audit_requests")
    .select("id", { count: "exact", head: true })
    .gte("created_at", new Date(Date.now() - sinceMs).toISOString());
  if (column && value) q = q.eq(column, value);
  const { count, error } = await q;
  if (error) throw new Error(`rate count: ${error.message}`);
  return count ?? 0;
}

async function sendEmail(subject: string, text: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("AUDIT_NOTIFY_TO");
  if (!key || !to) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: Deno.env.get("RESEND_FROM") ?? "hello@flowdocs.co.in",
      to: to.split(",").map((s) => s.trim()).filter(Boolean),
      subject,
      text,
    }),
  });
  if (!res.ok) {
    console.error("resend failed:", res.status, await res.text());
    return false;
  }
  return true;
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

  // Pretend success so bots learn nothing.
  if (isHoneypotFilled(body)) return json({ ok: true });

  const v = validateAuditRequest(body);
  if (!v.ok) return json({ error: v.error, field: v.field }, 400);

  try {
    if ((await recentCount("phone", v.value.phone, 86_400_000)) >= MAX_PER_PHONE_PER_DAY) {
      return json({ ok: true, duplicate: true }); // already have their request today
    }
    if ((await recentCount(null, null, 3_600_000)) >= MAX_PER_HOUR) {
      return json({ error: "Abhi bahut requests aa rahi hain. Thodi der baad try karein." }, 429);
    }

    const { data: row, error } = await supabaseAdmin
      .from("audit_requests")
      .insert({ ...v.value, consent_at: new Date().toISOString() })
      .select("id, created_at")
      .single();
    if (error || !row) throw new Error(`insert: ${error?.message}`);

    let emailed = false;
    try {
      const { subject, text } = formatAuditEmail({ ...v.value, created_at: row.created_at });
      emailed = await sendEmail(subject, text);
      if (emailed) {
        await supabaseAdmin.from("audit_requests").update({ notified_at: new Date().toISOString() }).eq("id", row.id);
      }
    } catch (err) {
      console.error("audit email error:", err);
    }

    return json({ ok: true, emailed });
  } catch (err) {
    console.error("audit-request error:", err);
    return json({ error: "Kuch gadbad ho gayi. Dobara try karein." }, 500);
  }
});
