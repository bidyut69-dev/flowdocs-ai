-- Free Lead Leak Audit requests from flowdocs.co.in/audit.
-- These are FlowDocs' own sales leads, not a client org's leads, so there is no org_id.
-- Written only by the audit-request Edge Function (service role). Only super-admins can read.

create table public.audit_requests (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  business_name text not null,
  phone         text not null,   -- E.164
  email         text,
  city          text,
  niche         text not null,
  monthly_leads text not null,
  message       text,
  source        jsonb not null default '{}'::jsonb,   -- referrer, utm_* from the page URL
  status        text not null default 'new' check (status in ('new', 'contacted', 'done', 'spam')),
  notified_at   timestamptz,   -- set when the notification email went out
  created_at    timestamptz not null default now()
);

create index audit_requests_created_idx on public.audit_requests (created_at desc);
create index audit_requests_phone_created_idx on public.audit_requests (phone, created_at desc);

alter table public.audit_requests enable row level security;

create policy audit_requests_admin_select on public.audit_requests
  for select to authenticated using (public.is_super_admin());
create policy audit_requests_admin_update on public.audit_requests
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());
