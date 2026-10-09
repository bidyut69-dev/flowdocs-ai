# FlowDocs AI

AI Lead Conversion System. Architecture: `CLAUDE.md`. Bot behaviour: `SYSTEM_DESIGN.md`. Final decisions: `DECISIONS.md`.

## Phase 1 (demo) — what's here

| Path | What |
|---|---|
| `supabase/migrations/20261009000001_phase1_schema.sql` | Full schema + RLS + no-double-booking constraint |
| `supabase/seed.sql` | Demo orgs: Skyline Realty, SmileCare Dental |
| `supabase/functions/_shared/` | `agent.ts` (Claude loop), `prompts.ts`, `conversation.ts` (intake / inbound / handoff / opt-out), `channel.ts` (demo adapter), pure helpers |
| `supabase/functions/demo-chat/` | Simulator backend (demo orgs only, rate-limited) |
| `apps/dashboard/src/pages/demo/Simulator.jsx` | Lead form + WhatsApp-style chat + owner alerts |
| `tests/unit/` | Pure logic tests (Node, no deps) |
| `supabase/tests/database/rls.test.sql` | RLS isolation + double booking (pgTAP) |
| `tests/acceptance/phase1.mjs` | SYSTEM_DESIGN §11 end-to-end run against the real function |

## Run locally

Needs Docker Desktop (for `supabase start`) and an Anthropic API key.

```bash
npm install
supabase start                      # prints API URL, anon key, service_role key
supabase db reset                   # applies migration + seed

# Edge Function secrets (local)
echo "ANTHROPIC_API_KEY=sk-ant-..." > supabase/functions/.env
supabase functions serve demo-chat --env-file supabase/functions/.env

# Dashboard
cp apps/dashboard/.env.example apps/dashboard/.env   # fill VITE_SUPABASE_ANON_KEY
npm run dev:dashboard               # open http://localhost:5173/demo/skyline-realty
```

## Tests

```bash
npm run test:unit                   # no backend needed
npm run test:db                     # RLS, needs supabase start
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:acceptance
```

The acceptance run calls Claude for real (a few cents). Mobile check: open the simulator at 375px width and confirm there is no horizontal scroll.
