// Row shapes for the tables Edge Functions touch. Mirrors supabase/migrations.

import type { BookingHours } from "./slots.ts";

export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "won"
  | "lost"
  | "opted_out"
  | "invalid_phone";

export type LeadSource = "meta_ads" | "website" | "manual" | "demo";

export interface QualificationQuestion {
  key: string;
  question: string;
}

export interface BudgetRange {
  label: string;
  min: number;
  max: number;
}

export interface Qualification {
  answers?: Record<string, string>;
  budget_min_inr?: number;
  budget_max_inr?: number;
  timeline_months?: number;
  summary?: string;
  visit_slot?: string;
}

export interface Organization {
  id: string;
  name: string;
  niche: string;
  slug: string;
  status: "demo" | "trial" | "active" | "paused";
}

export interface OrgConfig {
  org_id: string;
  business_name: string;
  city: string | null;
  services: { name: string; details?: string }[];
  faqs: { q: string; a: string }[];
  pricing_notes: string | null;
  booking_hours: BookingHours;
  slot_minutes: number;
  ai_tone: string | null;
  languages: string[];
  owner_whatsapp: string | null;
  owner_email: string | null;
  qualification_questions: QualificationQuestion[];
  handoff_rules: string | null;
  greeting_template: string | null;
  disclosure_text: string | null;
  project_address: string | null;
  budget_ranges: BudgetRange[];
  lead_consent_confirmed: boolean;
}

export interface Lead {
  id: string;
  org_id: string;
  name: string | null;
  phone: string;
  email: string | null;
  source: LeadSource;
  campaign: string | null;
  raw: Record<string, unknown>;
  status: LeadStatus;
  score: number;
  ai_paused: boolean;
  qualification: Qualification;
  unclear_count: number;
  first_response_at: string | null;
  last_inbound_at: string | null;
  created_at: string;
}

export interface MessageRow {
  id: string;
  org_id: string;
  lead_id: string;
  direction: "in" | "out";
  sender: "lead" | "ai" | "human" | "system";
  body: string;
  wa_message_id: string | null;
  template_name: string | null;
  status: string | null;
  created_at: string;
}

export interface MessageTemplate {
  id: string;
  org_id: string;
  name: string;
  language: string;
  use_case: "first_reply" | "visit_reminder_24h" | "visit_reminder_2h" | "followup" | "owner_alert" | "handoff_ack";
  status: "approved" | "pending" | "rejected";
  body: string | null;
}
