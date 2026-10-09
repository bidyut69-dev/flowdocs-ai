-- RLS + integrity tests. Run: supabase test db  (needs the local stack: supabase start)
-- Uses the seed orgs: Skyline Realty (1111…) and SmileCare Dental (2222…).

begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- ── Fixtures (as postgres, RLS bypassed) ──────────────────────
insert into auth.users (id, email) values
  ('aaaaaaaa-0000-4000-8000-00000000000a', 'owner@skyline.test'),
  ('bbbbbbbb-0000-4000-8000-00000000000b', 'staff@smilecare.test');

insert into public.org_members (org_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-00000000000a', 'owner'),
  ('22222222-2222-4222-8222-222222222222', 'bbbbbbbb-0000-4000-8000-00000000000b', 'staff');

insert into public.leads (id, org_id, name, phone, source) values
  ('cccccccc-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-111111111111', 'Skyline Lead',   '+919811111111', 'demo'),
  ('dddddddd-0000-4000-8000-00000000000d', '22222222-2222-4222-8222-222222222222', 'SmileCare Lead', '+919822222222', 'demo');

insert into public.messages (org_id, lead_id, direction, sender, body) values
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-00000000000d', 'in', 'lead', 'secret smilecare message');

insert into public.events (org_id, lead_id, type) values
  ('22222222-2222-4222-8222-222222222222', 'dddddddd-0000-4000-8000-00000000000d', 'lead_created');

select ok(
  exists (select 1 from public.profiles where id = 'aaaaaaaa-0000-4000-8000-00000000000a'),
  'signup trigger creates a profile'
);

-- ── Act as the Skyline owner ──────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-8000-00000000000a","role":"authenticated"}', true);

select results_eq(
  $$ select name from public.leads where id = 'cccccccc-0000-4000-8000-00000000000c' $$,
  array['Skyline Lead'],
  'Skyline owner sees their own lead'
);

select is_empty(
  $$ select 1 from public.leads where org_id = '22222222-2222-4222-8222-222222222222' $$,
  'Skyline owner cannot see SmileCare leads'
);

select is_empty(
  $$ select 1 from public.messages where org_id = '22222222-2222-4222-8222-222222222222' $$,
  'Skyline owner cannot see SmileCare messages'
);

select is_empty(
  $$ select 1 from public.events where org_id = '22222222-2222-4222-8222-222222222222' $$,
  'Skyline owner cannot see SmileCare events'
);

select is_empty(
  $$ select 1 from public.org_config where org_id = '22222222-2222-4222-8222-222222222222' $$,
  'Skyline owner cannot see SmileCare config'
);

select is_empty(
  $$ select 1 from public.organizations where id = '22222222-2222-4222-8222-222222222222' $$,
  'Skyline owner cannot see the SmileCare organization'
);

select throws_ok(
  $$ insert into public.leads (org_id, name, phone, source)
     values ('22222222-2222-4222-8222-222222222222', 'Injected', '+919833333333', 'manual') $$,
  '42501',
  null,
  'Skyline owner cannot insert a lead into SmileCare'
);

select is_empty(
  $$ update public.leads set name = 'hacked'
     where id = 'dddddddd-0000-4000-8000-00000000000d' returning 1 $$,
  'Skyline owner cannot update a SmileCare lead'
);

select throws_ok(
  $$ update public.profiles set is_super_admin = true
     where id = 'aaaaaaaa-0000-4000-8000-00000000000a' $$,
  '42501',
  null,
  'Users cannot make themselves super-admin'
);

select isnt_empty(
  $$ update public.org_config set ai_tone = 'Friendly'
     where org_id = '11111111-1111-4111-8111-111111111111' returning 1 $$,
  'Owner can edit their org config'
);

-- ── Act as SmileCare staff ────────────────────────────────────
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-8000-00000000000b","role":"authenticated"}', true);

select results_eq(
  $$ select count(*)::int from public.leads $$,
  array[1],
  'SmileCare staff sees exactly their one lead'
);

select is_empty(
  $$ update public.org_config set ai_tone = 'Rude'
     where org_id = '22222222-2222-4222-8222-222222222222' returning 1 $$,
  'Staff cannot edit org config (owner only)'
);

-- ── Anonymous ─────────────────────────────────────────────────
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is_empty($$ select 1 from public.leads $$, 'anon sees no leads');
select is_empty($$ select 1 from public.org_config $$, 'anon sees no org config');

-- ── Integrity: no double booking ──────────────────────────────
reset role;

insert into public.appointments (org_id, lead_id, starts_at, ends_at) values
  ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000c',
   '2026-10-10 05:30:00+00', '2026-10-10 06:30:00+00');

select throws_ok(
  $$ insert into public.appointments (org_id, lead_id, starts_at, ends_at) values
       ('11111111-1111-4111-8111-111111111111', 'cccccccc-0000-4000-8000-00000000000c',
        '2026-10-10 06:00:00+00', '2026-10-10 07:00:00+00') $$,
  '23P01',
  null,
  'Overlapping booked appointments are rejected at the DB level'
);

select * from finish();
rollback;
