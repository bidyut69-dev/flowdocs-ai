-- Lead priority (hot / warm / cold) + per-org scoring rules.
--
-- Score is recalculated after every qualification answer and after a booking (_shared/scoring.ts).
-- Priority follows the score unless the owner set it by hand: priority_locked = true keeps it.
-- scoring_rules default = DEFAULT_SCORING_RULES in scoring.ts; keep the two in sync.

alter table public.org_config
  add column scoring_rules jsonb not null default '{
    "points": {
      "budget_in_range": 25,
      "answered": {"bhk": 10},
      "timeline": [{"max_months": 3, "points": 25}, {"max_months": 6, "points": 15}],
      "visit_pref": 15,
      "visit_booked": 25
    },
    "priority": {"hot": 70, "warm": 40}
  }'::jsonb;

alter table public.leads
  add column priority text not null default 'cold' check (priority in ('hot', 'warm', 'cold')),
  add column priority_locked boolean not null default false;

-- Existing leads: priority from their current score, default thresholds.
update public.leads
set priority = case when score >= 70 then 'hot' when score >= 40 then 'warm' else 'cold' end;

create index leads_org_priority_idx on public.leads (org_id, priority, created_at desc);

-- RLS: no new tables. The new columns sit on leads and org_config, which already have RLS with
-- policies in the phase 1 migration: members read and lock priority only on their own org's leads
-- (leads_select / leads_update), and only owners edit scoring_rules (org_config_update). Re-asserted
-- here so this migration stays safe on its own.
alter table public.leads enable row level security;
alter table public.org_config enable row level security;
