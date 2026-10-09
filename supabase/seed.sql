-- Demo orgs for Phase 1. Fixed UUIDs so the simulator and tests can refer to them.
-- Pricing notes contain only what the business "confirmed" — the bot must not go beyond this.

insert into public.organizations (id, name, niche, slug, status) values
  ('11111111-1111-4111-8111-111111111111', 'Skyline Realty',   'real_estate', 'skyline-realty',   'demo'),
  ('22222222-2222-4222-8222-222222222222', 'SmileCare Dental', 'dental',      'smilecare-dental', 'demo');

-- ─────────────────────────────────────────────────────────────
-- Skyline Realty (real estate, Kolkata)
-- This is also the BOT_TESTS.md §0 fixture: some facts are present and some are left out on purpose
-- (no 3BHK price, no possession date, no inventory count). scripts/bot-tests.ts checks these values
-- before running, so change both together.
-- ─────────────────────────────────────────────────────────────
insert into public.org_config (
  org_id, business_name, city, services, faqs, pricing_notes, booking_hours, slot_minutes,
  ai_tone, languages, owner_whatsapp, owner_email, qualification_questions, handoff_rules,
  greeting_template, disclosure_text, project_address, budget_ranges, lead_consent_confirmed
) values (
  '11111111-1111-4111-8111-111111111111',
  'Skyline Realty',
  'Kolkata',
  '[
    {"name": "Skyline Greens, New Town", "details": "2BHK (850-950 sq ft) and 3BHK (1200-1350 sq ft), G+14 towers, clubhouse, pool, 24x7 security"}
  ]'::jsonb,
  '[
    {"q": "RERA number?", "a": "WBRERA/P/DEMO/0001 (demo)"},
    {"q": "Parking milegi?", "a": "Covered parking extra cost pe milti hai."}
  ]'::jsonb,
  '2BHK ₹45 lakh se shuru. Final price unit aur floor pe depend karta hai, visit pe confirm hoga.',
  '{
    "mon": [["10:00", "18:00"]], "tue": [["10:00", "18:00"]], "wed": [["10:00", "18:00"]],
    "thu": [["10:00", "18:00"]], "fri": [["10:00", "18:00"]], "sat": [["10:00", "18:00"]]
  }'::jsonb,
  60,
  'Warm, polite, thoda informal. Front-desk wali tameez. Hinglish chalega.',
  '{en,hi,bn}',
  '+919800000001',
  'owner@skylinerealty.example',
  '[
    {"key": "budget",     "question": "Aapka budget kitna hai? (jaise 40-50 lakh)"},
    {"key": "bhk",        "question": "2BHK dekh rahe hain ya 3BHK?"},
    {"key": "timeline",   "question": "Kab tak ghar lena chahte hain? 3 mahine, 6 mahine, ya abhi bas dekh rahe hain?"},
    {"key": "visit_pref", "question": "Site visit kab karna chahenge? Aaj, kal ya weekend?"}
  ]'::jsonb,
  'Turant handoff karo jab:
- Buyer insaan se baat karna chahe (human, manager, sales wale se baat karao, call karo)
- Complaint, gussa ya abusive language
- Price negotiation (kam karo, discount, best price, last price)
- Token, booking amount, loan, payment, cheque
- Legal ya refund ki baat
- Koi project, offer ya detail jo config me nahi hai',
  'Namaste {{name}}! {{disclosure}} Aapne {{project}} ke baare me poochha tha. Aapka budget kitna hai, bata denge to main site visit ka slot check kar deta hoon?',
  'Main {{builder_name}} ka virtual assistant hoon.',
  'Plot 12, Action Area II, New Town, Kolkata',
  '[
    {"label": "40-60L", "min": 4000000, "max": 6000000}
  ]'::jsonb,
  true
);

insert into public.message_templates (org_id, name, language, use_case, status, body) values
  ('11111111-1111-4111-8111-111111111111', 'skyline_first_reply', 'hi', 'first_reply', 'approved', null),
  ('11111111-1111-4111-8111-111111111111', 'skyline_handoff_ack', 'hi', 'handoff_ack', 'approved',
   'Main aapko abhi team se connect karta hoon, thoda wait karein.'),
  ('11111111-1111-4111-8111-111111111111', 'skyline_owner_alert', 'en', 'owner_alert', 'approved', null),
  ('11111111-1111-4111-8111-111111111111', 'skyline_followup',    'hi', 'followup',    'pending',
   'Namaste {{name}}, Skyline Greens ke baare me koi sawal ho to bata dijiye. Site visit ka slot bhi check kar sakta hoon.');

-- ─────────────────────────────────────────────────────────────
-- SmileCare Dental (clinic, Kolkata) — proves questions come from config, not code
-- ─────────────────────────────────────────────────────────────
insert into public.org_config (
  org_id, business_name, city, services, faqs, pricing_notes, booking_hours, slot_minutes,
  ai_tone, languages, owner_whatsapp, owner_email, qualification_questions, handoff_rules,
  greeting_template, disclosure_text, project_address, budget_ranges, lead_consent_confirmed
) values (
  '22222222-2222-4222-8222-222222222222',
  'SmileCare Dental',
  'Kolkata',
  '[
    {"name": "Dental implants", "details": "Single tooth aur full-mouth implants"},
    {"name": "Aligners", "details": "Clear aligners, 6-18 mahine treatment"},
    {"name": "Root canal", "details": "Single sitting RCT available"}
  ]'::jsonb,
  '[
    {"q": "Clinic kahan hai?", "a": "Salt Lake Sector 5, Kolkata."},
    {"q": "Consultation fee?", "a": "First consultation 500 rupees, X-ray alag."}
  ]'::jsonb,
  'Consultation 500 rupees. Implant aur aligner ka exact cost doctor checkup ke baad batayenge.',
  '{
    "mon": [["10:00", "13:00"], ["17:00", "20:00"]], "tue": [["10:00", "13:00"], ["17:00", "20:00"]],
    "wed": [["10:00", "13:00"], ["17:00", "20:00"]], "thu": [["10:00", "13:00"], ["17:00", "20:00"]],
    "fri": [["10:00", "13:00"], ["17:00", "20:00"]], "sat": [["10:00", "14:00"]]
  }'::jsonb,
  30,
  'Caring, calm, professional. Medical advice kabhi nahi.',
  '{en,hi,bn}',
  '+919800000002',
  'owner@smilecare.example',
  '[
    {"key": "treatment",  "question": "Aap kis treatment ke liye dekh rahe hain? Implant, aligner ya kuch aur?"},
    {"key": "timeline",   "question": "Treatment kab tak shuru karna chahenge?"},
    {"key": "visit_pref", "question": "Consultation ke liye kab aana chahenge?"}
  ]'::jsonb,
  'Turant handoff karo jab:
- Patient insaan ya doctor se baat karna chahe
- Dard, emergency, ya koi medical sawal (diagnosis, dawai)
- Complaint, gussa ya abusive language
- Discount, EMI, insurance, payment
- Refund ya legal baat
- Koi treatment ya detail jo config me nahi hai',
  'Namaste {{name}}! {{disclosure}} Aapne {{project}} ke baare me poochha tha. Aap kis treatment ke liye dekh rahe hain?',
  'Main {{builder_name}} ki virtual assistant hoon.',
  'SmileCare Dental, DN-12, Sector 5, Salt Lake, Kolkata 700091',
  '[]'::jsonb,
  false
);

insert into public.message_templates (org_id, name, language, use_case, status, body) values
  ('22222222-2222-4222-8222-222222222222', 'smilecare_first_reply', 'hi', 'first_reply', 'approved', null),
  ('22222222-2222-4222-8222-222222222222', 'smilecare_handoff_ack', 'hi', 'handoff_ack', 'approved',
   'Main aapko abhi hamari team se connect karti hoon, thoda wait karein.'),
  ('22222222-2222-4222-8222-222222222222', 'smilecare_owner_alert', 'en', 'owner_alert', 'approved', null);

-- SmileCare asks "treatment" instead of "bhk": give that answer the points (scoring_rules default is real estate).
update public.org_config
set scoring_rules = jsonb_set(scoring_rules, '{points,answered}', '{"treatment": 10}'::jsonb)
where org_id = '22222222-2222-4222-8222-222222222222';
