-- FlowDocs AI — Phase 1 schema
-- Source of truth: CLAUDE.md §4 + DECISIONS.md §B.
-- Every table gets RLS in this same migration. Edge Functions use the service role (bypasses RLS).

create extension if not exists btree_gist;

-- ─────────────────────────────────────────────────────────────
-- Profiles (super-admin flag lives here)
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  full_name      text,
  is_super_admin boolean not null default false,
  created_at     timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- Tenancy
-- ─────────────────────────────────────────────────────────────
create table public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  niche      text not null,
  slug       text not null unique,
  status     text not null default 'demo'
             check (status in ('demo', 'trial', 'active', 'paused')),
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'staff' check (role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index org_members_user_idx on public.org_members (user_id);

-- RLS helpers. security definer so policies can read org_members/profiles without recursion.
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_super_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

create or replace function public.my_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id from public.org_members m where m.user_id = auth.uid()
  union
  select o.id from public.organizations o where public.is_super_admin();
$$;

create or replace function public.my_owner_org_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.org_id from public.org_members m
  where m.user_id = auth.uid() and m.role = 'owner'
  union
  select o.id from public.organizations o where public.is_super_admin();
$$;

revoke all on function public.is_super_admin() from public, anon;
revoke all on function public.my_org_ids() from public, anon;
revoke all on function public.my_owner_org_ids() from public, anon;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.my_org_ids() to authenticated;
grant execute on function public.my_owner_org_ids() to authenticated;

-- ─────────────────────────────────────────────────────────────
-- Org config (this is what tunes the AI)
-- ─────────────────────────────────────────────────────────────
create table public.org_config (
  org_id                  uuid primary key references public.organizations(id) on delete cascade,
  business_name           text not null,
  city                    text,
  services                jsonb not null default '[]'::jsonb,
  faqs                    jsonb not null default '[]'::jsonb,
  pricing_notes           text,
  booking_hours           jsonb not null default '{}'::jsonb,   -- {"mon":[["10:00","19:00"]], ...} in IST
  slot_minutes            int not null default 60 check (slot_minutes between 10 and 480),
  ai_tone                 text,
  languages               text[] not null default '{en,hi}',
  owner_whatsapp          text,
  owner_email             text,
  qualification_questions jsonb not null default '[]'::jsonb,   -- [{"key","question"}], asked in order
  handoff_rules           text,
  greeting_template       text,
  disclosure_text         text default 'Main {{builder_name}} ka virtual assistant hoon.',
  project_address         text,
  budget_ranges           jsonb not null default '[]'::jsonb,   -- [{"label":"40-50L","min":4000000,"max":5000000}]
  lead_consent_confirmed  boolean not null default false,
  updated_at              timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- WhatsApp numbers (token lives in Supabase Vault; we keep only the secret id)
-- ─────────────────────────────────────────────────────────────
create table public.whatsapp_numbers (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  phone_number_id        text not null unique,
  display_number         text not null,
  waba_id                text not null,
  access_token_secret_id uuid,   -- vault.secrets.id
  created_at             timestamptz not null default now()
);

create index whatsapp_numbers_org_idx on public.whatsapp_numbers (org_id);

-- ─────────────────────────────────────────────────────────────
-- Message templates (Meta approval tracking per org)
-- ─────────────────────────────────────────────────────────────
create table public.message_templates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null,
  language         text not null default 'en',
  use_case         text not null
                   check (use_case in ('first_reply', 'visit_reminder_24h', 'visit_reminder_2h',
                                       'followup', 'owner_alert', 'handoff_ack')),
  status           text not null default 'pending'
                   check (status in ('approved', 'pending', 'rejected')),
  meta_template_id text,
  body             text,   -- text as submitted to Meta; used for rendering and dashboard preview
  created_at       timestamptz not null default now(),
  unique (org_id, name, language)
);

create index message_templates_org_use_idx on public.message_templates (org_id, use_case, status);

-- ─────────────────────────────────────────────────────────────
-- Leads
-- ─────────────────────────────────────────────────────────────
create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text,
  phone             text not null,   -- E.164 when valid; raw input when status = 'invalid_phone'
  email             text,
  source            text not null check (source in ('meta_ads', 'website', 'manual', 'demo')),
  campaign          text,
  raw               jsonb not null default '{}'::jsonb,
  status            text not null default 'new'
                    check (status in ('new', 'contacted', 'qualified', 'booked', 'won', 'lost',
                                      'opted_out', 'invalid_phone')),
  score             int not null default 0,
  ai_paused         boolean not null default false,
  qualification     jsonb not null default '{}'::jsonb,   -- budget, bhk, timeline, visit_pref, summary
  unclear_count     int not null default 0,
  first_response_at timestamptz,
  last_inbound_at   timestamptz,
  created_at        timestamptz not null default now()
);

create index leads_org_created_idx on public.leads (org_id, created_at desc);
create unique index leads_org_phone_key on public.leads (org_id, phone);

-- ─────────────────────────────────────────────────────────────
-- Messages
-- ─────────────────────────────────────────────────────────────
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  direction     text not null check (direction in ('in', 'out')),
  sender        text not null check (sender in ('lead', 'ai', 'human', 'system')),
  body          text not null,
  wa_message_id text unique,
  template_name text,
  status        text,
  created_at    timestamptz not null default now()
);

create index messages_lead_created_idx on public.messages (lead_id, created_at);
create index messages_org_created_idx on public.messages (org_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- Appointments (DB-level guard against double booking)
-- ─────────────────────────────────────────────────────────────
create table public.appointments (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  lead_id    uuid not null references public.leads(id) on delete cascade,
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  status     text not null default 'booked'
             check (status in ('booked', 'cancelled', 'done', 'no_show')),
  notes      text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  constraint appointments_no_overlap
    exclude using gist (org_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
    where (status = 'booked')
);

create index appointments_org_starts_idx on public.appointments (org_id, starts_at);

-- ─────────────────────────────────────────────────────────────
-- Follow-up jobs (runner ships in Phase 2; table is part of the core schema)
-- ─────────────────────────────────────────────────────────────
create table public.followup_jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  lead_id       uuid not null references public.leads(id) on delete cascade,
  step          int not null,
  run_at        timestamptz not null,
  status        text not null default 'pending'
                check (status in ('pending', 'sent', 'cancelled', 'failed')),
  template_name text,
  created_at    timestamptz not null default now()
);

create index followup_jobs_status_run_idx on public.followup_jobs (status, run_at);
create index followup_jobs_lead_idx on public.followup_jobs (lead_id);

-- ─────────────────────────────────────────────────────────────
-- Events (audit log)
-- ─────────────────────────────────────────────────────────────
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  lead_id    uuid references public.leads(id) on delete cascade,
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index events_org_created_idx on public.events (org_id, created_at desc);
create index events_lead_created_idx on public.events (lead_id, created_at);

-- ─────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────
alter table public.profiles          enable row level security;
alter table public.organizations     enable row level security;
alter table public.org_members       enable row level security;
alter table public.org_config        enable row level security;
alter table public.whatsapp_numbers  enable row level security;
alter table public.message_templates enable row level security;
alter table public.leads             enable row level security;
alter table public.messages          enable row level security;
alter table public.appointments      enable row level security;
alter table public.followup_jobs     enable row level security;
alter table public.events            enable row level security;

-- profiles: read/update own row; super-admin flag can never be self-set
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name) on public.profiles to authenticated;

-- organizations: members read; super-admin writes
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select public.my_org_ids()));
create policy organizations_admin_all on public.organizations
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- org_members: see your own memberships; super-admin manages
create policy org_members_select on public.org_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());
create policy org_members_admin_all on public.org_members
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- org_config: members read; owners (and super-admin) edit
create policy org_config_select on public.org_config
  for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy org_config_update on public.org_config
  for update to authenticated
  using (org_id in (select public.my_owner_org_ids()))
  with check (org_id in (select public.my_owner_org_ids()));
create policy org_config_admin_insert on public.org_config
  for insert to authenticated
  with check (public.is_super_admin());

-- whatsapp_numbers: members read; super-admin writes
create policy whatsapp_numbers_select on public.whatsapp_numbers
  for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy whatsapp_numbers_admin_all on public.whatsapp_numbers
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- message_templates: members read; super-admin writes
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (org_id in (select public.my_org_ids()));
create policy message_templates_admin_all on public.message_templates
  for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- leads / messages / appointments / followup_jobs: members read + write their org; delete is super-admin only
create policy leads_select on public.leads
  for select to authenticated using (org_id in (select public.my_org_ids()));
create policy leads_insert on public.leads
  for insert to authenticated with check (org_id in (select public.my_org_ids()));
create policy leads_update on public.leads
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy leads_delete on public.leads
  for delete to authenticated using (public.is_super_admin());

create policy messages_select on public.messages
  for select to authenticated using (org_id in (select public.my_org_ids()));
create policy messages_insert on public.messages
  for insert to authenticated with check (org_id in (select public.my_org_ids()));
create policy messages_update on public.messages
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy messages_delete on public.messages
  for delete to authenticated using (public.is_super_admin());

create policy appointments_select on public.appointments
  for select to authenticated using (org_id in (select public.my_org_ids()));
create policy appointments_insert on public.appointments
  for insert to authenticated with check (org_id in (select public.my_org_ids()));
create policy appointments_update on public.appointments
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy appointments_delete on public.appointments
  for delete to authenticated using (public.is_super_admin());

create policy followup_jobs_select on public.followup_jobs
  for select to authenticated using (org_id in (select public.my_org_ids()));
create policy followup_jobs_insert on public.followup_jobs
  for insert to authenticated with check (org_id in (select public.my_org_ids()));
create policy followup_jobs_update on public.followup_jobs
  for update to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
create policy followup_jobs_delete on public.followup_jobs
  for delete to authenticated using (public.is_super_admin());

-- events: append-only audit log for members
create policy events_select on public.events
  for select to authenticated using (org_id in (select public.my_org_ids()));
create policy events_insert on public.events
  for insert to authenticated with check (org_id in (select public.my_org_ids()));
