// Template rendering + owner alert formats. Pure functions, no I/O.

import { formatIstClock, formatIstDay } from "./time.ts";
import type { Lead, OrgConfig, QualificationQuestion } from "./types.ts";

// DECISIONS §A.2: every business-initiated template carries this line; free-form AI replies don't.
export const STOP_LINE = "Band karne ke liye STOP likhein.";

export const TEMPLATE_USE_CASES_WITH_STOP = new Set([
  "first_reply",
  "followup",
  "visit_reminder_24h",
  "visit_reminder_2h",
]);

/** Replace {{key}} placeholders. Unknown keys render as empty strings. */
export function render(template: string, vars: Record<string, string | null | undefined>): string {
  return template
    .replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function withStopLine(text: string): string {
  return /\bSTOP\b/.test(text) ? text : `${text}\n\n${STOP_LINE}`;
}

export function renderDisclosure(config: OrgConfig): string {
  const base = config.disclosure_text?.trim() || "Main {{builder_name}} ka virtual assistant hoon.";
  return render(base, { builder_name: config.business_name, business_name: config.business_name });
}

export function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "ji";
}

/** First reply (approved first_reply template). Always includes the disclosure and STOP line. */
export function renderGreeting(config: OrgConfig, lead: Pick<Lead, "name">, project: string): string {
  const disclosure = renderDisclosure(config);
  const tpl = config.greeting_template?.trim() ||
    "Namaste {{name}}! {{disclosure}} Aapne {{project}} ke baare me poochha tha. Kya main aapki madad kar sakta hoon?";
  let text = render(tpl, {
    name: firstName(lead.name),
    disclosure,
    builder_name: config.business_name,
    business_name: config.business_name,
    project,
  });
  // The template must disclose; if an edited template dropped the placeholder, prepend it.
  if (!text.toLowerCase().includes("virtual assistant")) text = `${disclosure} ${text}`;
  return withStopLine(text);
}

// ─── Owner alerts (SYSTEM_DESIGN §8, max 5 lines) ─────────────────

const KEY_LABELS: Record<string, string> = { bhk: "BHK", visit_pref: "Visit pref" };

function label(key: string): string {
  return KEY_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export type OwnerAlertKind = "new_lead" | "visit_booked" | "handoff" | "invalid_phone";

const HEADERS: Record<OwnerAlertKind, string> = {
  new_lead: "New lead",
  visit_booked: "Visit booked",
  handoff: "Handoff needed",
  invalid_phone: "Lead with invalid phone",
};

export function formatOwnerAlert(
  kind: OwnerAlertKind,
  lead: Pick<Lead, "name" | "phone" | "score" | "status" | "qualification">,
  questions: QualificationQuestion[],
  extra: { visitAt?: Date | null; reason?: string } = {},
): string {
  const q = lead.qualification ?? {};
  const answerLine = questions
    .filter((x) => x.key !== "visit_pref")
    .map((x) => `${label(x.key)}: ${q.answers?.[x.key] || "-"}`)
    .join(" | ");

  const visit = extra.visitAt
    ? `${formatIstDay(extra.visitAt)}, ${formatIstClock(extra.visitAt)}`
    : (q.visit_slot || "not booked");

  const lines = [
    `🔔 ${HEADERS[kind]}: ${lead.name || "Unknown"} (${lead.phone})`,
    answerLine || "No answers yet",
    `Score: ${lead.score} | Status: ${lead.status}`,
    `Visit: ${visit}`,
    // Handoff alerts carry the reason in place of the note so the alert stays at 5 lines.
    kind === "handoff" ? `Reason: ${extra.reason || "-"}` : `Note: ${q.summary || "-"}`,
  ];
  return lines.join("\n");
}

export function formatOptOutAlert(lead: Pick<Lead, "name" | "phone">): string {
  return `${lead.name || lead.phone} ne message band karne ko kaha (STOP).`;
}
