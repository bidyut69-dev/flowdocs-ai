// Validation + email text for Free Lead Leak Audit requests. Pure, no I/O.

import { normalizePhone } from "./phone.ts";
import { formatIstClock, formatIstDay } from "./time.ts";

export const NICHES = [
  "Real estate",
  "IVF / fertility clinic",
  "Hair transplant clinic",
  "Dental clinic",
  "Coaching institute",
  "Study abroad consultant",
  "Other",
] as const;

export const LEAD_BUCKETS = ["100 se kam", "100-300", "300-1000", "1000 se zyada"] as const;

export interface AuditRequestInput {
  name: string;
  business_name: string;
  phone: string; // E.164
  email: string | null;
  city: string | null;
  niche: string;
  monthly_leads: string;
  message: string | null;
  source: Record<string, string>;
}

export type Validation = { ok: true; value: AuditRequestInput } | { ok: false; error: string; field?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SOURCE_KEYS = ["referrer", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

export function validateAuditRequest(body: Record<string, unknown>): Validation {
  const name = str(body.name, 80);
  const business_name = str(body.business_name, 120);
  const phone = normalizePhone(str(body.phone, 20));
  const email = str(body.email, 120);
  const city = str(body.city, 60);
  const niche = str(body.niche, 60);
  const monthly_leads = str(body.monthly_leads, 30);
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 1000) : "";

  if (!name) return { ok: false, error: "Naam likhiye", field: "name" };
  if (!business_name) return { ok: false, error: "Business ka naam likhiye", field: "business_name" };
  if (!phone) return { ok: false, error: "Sahi WhatsApp number likhiye", field: "phone" };
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "Email sahi nahi lag raha", field: "email" };
  if (!(NICHES as readonly string[]).includes(niche)) return { ok: false, error: "Business type chuniye", field: "niche" };
  if (!(LEAD_BUCKETS as readonly string[]).includes(monthly_leads)) {
    return { ok: false, error: "Har mahine kitne leads aate hain, chuniye", field: "monthly_leads" };
  }
  if (body.consent !== true) return { ok: false, error: "Contact ke liye consent tick karein", field: "consent" };

  const source: Record<string, string> = {};
  const rawSource = (body.source && typeof body.source === "object" ? body.source : {}) as Record<string, unknown>;
  for (const k of SOURCE_KEYS) {
    const v = str(rawSource[k], 200);
    if (v) source[k] = v;
  }

  return {
    ok: true,
    value: {
      name,
      business_name,
      phone,
      email: email || null,
      city: city || null,
      niche,
      monthly_leads,
      message: message || null,
      source,
    },
  };
}

/** Bots fill every field; people never see this one. */
export function isHoneypotFilled(body: Record<string, unknown>): boolean {
  return typeof body.website === "string" && body.website.trim().length > 0;
}

export function formatAuditEmail(r: AuditRequestInput & { created_at: string }): { subject: string; text: string } {
  const at = new Date(r.created_at);
  const lines = [
    `Naya Lead Leak Audit request`,
    ``,
    `Naam: ${r.name}`,
    `Business: ${r.business_name}${r.city ? `, ${r.city}` : ""}`,
    `Type: ${r.niche}`,
    `Leads / mahina: ${r.monthly_leads}`,
    `WhatsApp: ${r.phone}`,
    `Email: ${r.email ?? "-"}`,
    `Message: ${r.message ?? "-"}`,
    ``,
    `Time: ${formatIstDay(at)}, ${formatIstClock(at)} IST`,
    ...(Object.keys(r.source).length
      ? [`Source: ${Object.entries(r.source).map(([k, v]) => `${k}=${v}`).join(", ")}`]
      : []),
  ];
  return { subject: `Audit request: ${r.business_name} (${r.niche})`, text: lines.join("\n") };
}
