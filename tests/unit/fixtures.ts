// Shared test fixtures: the two seed orgs, trimmed, plus a lead factory.

import type { Lead, OrgConfig } from "../../supabase/functions/_shared/types.ts";

export const realEstate: OrgConfig = {
  org_id: "org-1",
  business_name: "Skyline Realty",
  city: "Kolkata",
  services: [{ name: "Skyline Greens, New Town", details: "2BHK and 3BHK" }],
  faqs: [{ q: "RERA?", a: "WBRERA/P/NOR/2025/001234" }],
  pricing_notes: "2BHK starting 48 lakh",
  booking_hours: { sat: [["10:00", "13:00"]], sun: [["10:00", "13:00"]] },
  slot_minutes: 60,
  ai_tone: "Warm and polite",
  languages: ["en", "hi", "bn"],
  owner_whatsapp: "+919800000001",
  owner_email: null,
  qualification_questions: [
    { key: "budget", question: "Budget?" },
    { key: "bhk", question: "BHK?" },
    { key: "timeline", question: "Kab tak?" },
    { key: "visit_pref", question: "Visit kab?" },
  ],
  handoff_rules: "CUSTOM-HANDOFF-RULES-FROM-CONFIG",
  greeting_template: "Namaste {{name}}! {{disclosure}} Aapne {{project}} ke baare me poochha tha. Budget kitna hai?",
  disclosure_text: "Main {{builder_name}} ka virtual assistant hoon.",
  project_address: "Plot 7, New Town",
  budget_ranges: [{ label: "40-50L", min: 4_000_000, max: 5_000_000 }],
  lead_consent_confirmed: true,
};

export const dental: OrgConfig = {
  ...realEstate,
  business_name: "SmileCare Dental",
  qualification_questions: [
    { key: "treatment", question: "Treatment?" },
    { key: "timeline", question: "Kab?" },
    { key: "visit_pref", question: "Consultation kab?" },
  ],
  budget_ranges: [],
};

export const lead = (over: Partial<Lead> = {}): Lead => ({
  id: "lead-1",
  org_id: "org-1",
  name: "Rahul Sharma",
  phone: "+919876543210",
  email: null,
  source: "demo",
  campaign: null,
  raw: {},
  status: "contacted",
  score: 0,
  ai_paused: false,
  qualification: {},
  unclear_count: 0,
  first_response_at: null,
  last_inbound_at: null,
  created_at: "2026-10-09T05:00:00Z",
  ...over,
});
