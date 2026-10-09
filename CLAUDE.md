# FlowDocs AI — Lead Conversion System

> Project brief + architecture for Claude Code. Read this fully before writing any code.

## 1. What we are building

FlowDocs (flowdocs.co.in) is now an **AI automation agency**. We sell one high-ticket product to businesses that run paid ads and have high-value leads (real estate, IVF / hair transplant / dental implant clinics, coaching institutes, study-abroad consultants):

**"AI Lead Conversion System"** — every new lead gets a WhatsApp reply within 60 seconds, is qualified by AI, gets an appointment/site-visit booked, and is followed up automatically for 7–14 days. The business owner sees everything in a dashboard.

This repo contains:
1. **Marketing site** — `flowdocs.co.in` (agency landing page, demo video, audit booking CTA)
2. **Client dashboard** — `dashboard.flowdocs.co.in` (multi-tenant, one org per client business)
3. **Backend** — Supabase (Postgres + Edge Functions + pg_cron) handling lead intake, WhatsApp, AI agent, follow-ups, bookings
4. **Demo mode** — a WhatsApp-style chat simulator so the full flow can be demoed on video without Meta approval

The old FlowDocs contract SaaS lives in a separate repo and will move to `app.flowdocs.co.in`. Do not touch it.

## 2. Stack (fixed — do not swap)

| Layer | Choice |
|---|---|
| Frontend | React + Vite, Tailwind CSS, React Router |
| Hosting | Vercel |
| DB / Auth / Storage | Supabase (Postgres, RLS, Auth, Storage) |
| Server logic | Supabase Edge Functions (Deno, TypeScript) |
| Scheduling | pg_cron + pg_net (calls Edge Functions) |
| WhatsApp | Meta WhatsApp Cloud API (direct) |
| AI | Anthropic Claude API — `claude-haiku-5-5` for chat replies, `claude-sonnet-5-5` for weekly report summaries |
| Email | Resend |
| Payments (later) | Razorpay |
| Analytics | PostHog (marketing site only) |

## 3. Repo structure

```
flowdocs-ai/
├── CLAUDE.md
├── apps/
│   ├── site/                     # flowdocs.co.in — marketing landing
│   │   ├── src/pages/Landing.jsx
│   │   ├── src/pages/Audit.jsx   # "Free Lead Leak Audit" booking page
│   │   └── src/pages/Legal.jsx
│   └── dashboard/                # dashboard.flowdocs.co.in
│       ├── src/pages/Login.jsx
│       ├── src/pages/Leads.jsx
│       ├── src/pages/Conversation.jsx
│       ├── src/pages/Appointments.jsx
│       ├── src/pages/Settings.jsx      # business info, FAQs, hours, AI tone
│       ├── src/pages/Stats.jsx
│       ├── src/pages/admin/Orgs.jsx    # super-admin (me) only
│       ├── src/pages/demo/Simulator.jsx # WhatsApp-style demo chat
│       └── src/lib/supabase.js
├── supabase/
│   ├── migrations/               # numbered SQL files, never edit old ones
│   ├── seed.sql                  # demo orgs: "Skyline Realty", "SmileCare Dental"
│   └── functions/
│       ├── _shared/
│       │   ├── supabaseAdmin.ts
│       │   ├── whatsapp.ts       # send text / send template / verify signature
│       │   ├── agent.ts          # Claude call + tool handling
│       │   ├── prompts.ts        # system prompt builder from org_config
│       │   └── phone.ts          # normalize to E.164 (+91 default)
│       ├── lead-intake/          # website forms + generic webhook
│       ├── meta-leads-webhook/   # Facebook/Instagram Lead Ads
│       ├── whatsapp-webhook/     # inbound WhatsApp messages + status
│       ├── demo-chat/            # simulator endpoint (no WhatsApp)
│       ├── followup-runner/      # called by pg_cron every 5 min
│       └── weekly-report/        # called by pg_cron Monday 9:00 IST
└── package.json                  # npm workspaces
```

## 4. Database schema (Postgres)

All tenant tables have `org_id uuid not null` and RLS: a user can only read/write rows where `org_id` is in their `org_members`. Edge Functions use the service role.

```
organizations      id, name, niche, slug, status('demo'|'trial'|'active'|'paused'), created_at
org_members        org_id, user_id, role('owner'|'staff')
org_config         org_id (pk), business_name, city, services jsonb, faqs jsonb,
                   pricing_notes text, booking_hours jsonb, slot_minutes int,
                   ai_tone text, languages text[] default {en,hi},
                   owner_whatsapp text, owner_email text,
                   qualification_questions jsonb, handoff_rules text,
                   greeting_template text, disclosure_text text, project_address text,
                   budget_ranges jsonb, lead_consent_confirmed bool default false
whatsapp_numbers   org_id, phone_number_id, display_number, waba_id, access_token (encrypted / vault)
message_templates  id, org_id, name, language, use_case('first_reply'|'visit_reminder_24h'|'visit_reminder_2h'|
                   'followup'|'owner_alert'|'handoff_ack'), status('approved'|'pending'|'rejected'),
                   meta_template_id, body text, created_at
leads              id, org_id, name, phone (E.164), email, source('meta_ads'|'website'|'manual'|'demo'),
                   campaign, raw jsonb, status('new'|'contacted'|'qualified'|'booked'|'won'|'lost'|'opted_out'|'invalid_phone'),
                   score int, ai_paused bool default false,
                   qualification jsonb default '{}', unclear_count int default 0,
                   first_response_at, last_inbound_at, created_at
messages           id, org_id, lead_id, direction('in'|'out'), sender('lead'|'ai'|'human'|'system'),
                   body, wa_message_id, template_name, status, created_at
appointments       id, org_id, lead_id, starts_at timestamptz, ends_at, status('booked'|'cancelled'|'done'|'no_show'),
                   notes, created_at
followup_jobs      id, org_id, lead_id, step int, run_at timestamptz,
                   status('pending'|'sent'|'cancelled'|'failed'), template_name, created_at
events             id, org_id, lead_id, type text, payload jsonb, created_at   -- audit log
```

Indexes: `leads(org_id, created_at desc)`, `leads(org_id, phone)` unique, `messages(lead_id, created_at)`, `followup_jobs(status, run_at)`.

All timestamps stored UTC, displayed in **Asia/Kolkata**.

## 5. Core flows

### 5.1 Lead intake (target: first message < 60 sec)
1. Lead arrives via `meta-leads-webhook` (fetch full lead from Graph API using leadgen_id) or `lead-intake` (POST with org API key).
2. Normalize phone → upsert `leads` (dedupe on org_id + phone).
3. Send WhatsApp **approved template** (business-initiated — free-form is NOT allowed outside the 24h window). Template: greeting + business name + one question.
4. Set `first_response_at`, status `contacted`, log event.
5. Create follow-up jobs (see 5.3).
6. Notify owner (WhatsApp to `owner_whatsapp` or Resend email): "New lead: name, phone, source".

### 5.2 Inbound WhatsApp → AI agent
1. `whatsapp-webhook`: handle GET verification; on POST **verify `X-Hub-Signature-256`** with app secret. Reject if invalid.
2. Map `phone_number_id` → org, sender phone → lead (create lead if unknown, source 'manual').
3. Store message, update `last_inbound_at`, cancel pending follow-ups for this lead.
4. If `ai_paused` → stop (human handles it from dashboard).
5. Call `agent.ts`: system prompt built from `org_config` + last 20 messages. Reply in the lead's language (English / Hindi / Hinglish / Bengali). Short, human, WhatsApp-style — no long paragraphs, no markdown.
6. Agent tools:
   - `get_available_slots(date)` → computed from booking_hours − existing appointments
   - `book_appointment(starts_at, notes)` → insert appointment, status 'booked', notify owner
   - `update_lead(status, score, notes)`
   - `handoff_to_human(reason)` → set `ai_paused = true`, notify owner immediately
7. Send reply as free-form text (inside 24h window). Store outbound message.
8. Hard rules in prompt: never invent prices/offers not in config; never give medical/legal advice; hand off on complaints, angry leads, or anything outside config; respect "STOP"/"not interested" → status `opted_out`, no more messages.

### 5.3 Follow-up sequence
- Default steps after intake if no reply: +2h, +1 day, +3 days, +7 days, +14 days (configurable per org).
- `followup-runner` (pg_cron every 5 min): pick `pending` jobs where `run_at <= now()`, use `FOR UPDATE SKIP LOCKED`.
- If last inbound is < 24h ago → may send AI-written free-form nudge; else → send approved template.
- Skip if lead status is booked / won / lost / opted_out. Do not send between 9:00 PM and 9:00 AM IST — reschedule to 9:30 AM.

### 5.4 Appointments
- Booking reminders: 24h before and 2h before (template).
- After appointment time: owner marks done / no_show in dashboard. no_show → re-engagement message next day.

### 5.5 Dashboard
- **Leads**: table with status filters, source, response time, search.
- **Conversation**: WhatsApp-like thread, "Take over" toggle (sets ai_paused), human can type and send (free-form only inside 24h, else template picker).
- **Appointments**: list + day view.
- **Stats**: avg first-response time, leads → contacted → qualified → booked funnel, by source/campaign, last 7/30 days.
- **Settings**: edit org_config (this is what tunes the AI).
- **Admin** (super-admin only, checked via `is_super_admin` flag on profile): create orgs, invite owners, connect WhatsApp numbers, switch status.

### 5.6 Weekly report
Monday 9:00 IST: per active org, compute stats, have `claude-sonnet-5-5` write a 5-line plain-language summary, email via Resend to owner. This is the retention lever — owner must see value every week.

### 5.7 Demo mode (BUILD FIRST)
- `demo/Simulator.jsx`: phone-frame UI. Left: fake Facebook lead form ("Skyline Realty — 2BHK in New Town"). Submit → right: WhatsApp-style chat shows instant AI message, user can chat, AI books a visit, a toast shows "Owner notified".
- Uses `demo-chat` Edge Function with the same `agent.ts` and a demo org — same brain, no WhatsApp API.
- Must look good on a screen recording (mobile frame, smooth typing indicator, timestamps).

## 6. Environment variables

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
META_APP_SECRET, META_VERIFY_TOKEN, META_GRAPH_VERSION
RESEND_API_KEY, RESEND_FROM=hello@flowdocs.co.in
LEAD_INTAKE_SIGNING_SECRET
```
Per-org WhatsApp tokens live in the DB (Supabase Vault), never in env or frontend.

## 7. Build phases

**Phase 1 — Demo (2 days)**
Schema + seed demo orgs, `agent.ts` + `prompts.ts`, `demo-chat` function, Simulator page. Goal: record a 90-second demo video.

**Phase 2 — Live MVP for first client (week 1–2)**
WhatsApp webhook + send, lead-intake, meta-leads-webhook, follow-up runner, owner notifications, dashboard Login / Leads / Conversation / Settings, admin org creation.

**Phase 3 — Retention (week 3–4)**
Appointments page + reminders, Stats page, weekly report, no-show flow.

**Phase 4 — Scale (later)**
Razorpay retainer billing, Google Sheets / CRM export, voice-call AI, multiple WhatsApp numbers per org, marketing site case-study section.

## 8. Rules for Claude Code

- Keep it shippable. No feature outside the current phase unless asked.
- When changing a file, output the **complete file**, not partial snippets.
- TypeScript in Edge Functions, JSX in React apps. Mobile-first UI (clients check on phones).
- Every webhook: verify signature, be idempotent (dedupe on `wa_message_id` / `leadgen_id`), return 200 fast.
- Never expose service role key or WhatsApp tokens to the frontend.
- Every new table gets RLS in the same migration.
- Log important actions to `events`.
- Indian context: +91 phone default, IST display, ₹ formatting, Hinglish-friendly copy.
- AI replies must sound like a polite human front-desk person, 1–3 short lines, never mention being "an AI language model".
