# FlowDocs AI

AI Lead Conversion System. Architecture: `CLAUDE.md`. Bot behaviour: `SYSTEM_DESIGN.md`. Final decisions: `DECISIONS.md`.

## Phase 1 (demo) — what's here

| Path | What |
|---|---|
| `supabase/migrations/20261009000001_phase1_schema.sql` | Full schema + RLS + no-double-booking constraint |
| `supabase/seed.sql` | Demo orgs: Skyline Realty, SmileCare Dental |
| `supabase/functions/_shared/` | `agent.ts` (Claude loop), `mockAgent.ts` (free scripted bot), `prompts.ts`, `conversation.ts` (intake / inbound / handoff / opt-out), `channel.ts` (demo adapter), pure helpers |
| `supabase/functions/demo-chat/` | Simulator backend (demo orgs only, rate-limited) |
| `apps/dashboard/src/pages/demo/Simulator.jsx` | Lead form + WhatsApp-style chat + owner alerts |
| `tests/unit/` | Pure logic tests (Node, no deps) |
| `supabase/tests/database/rls.test.sql` | RLS isolation + double booking (pgTAP) |
| `tests/acceptance/phase1.mjs` | SYSTEM_DESIGN §11 end-to-end run against the real function |

## Run locally

Needs Docker Desktop (for `supabase start`). An Anthropic API key is optional: with `AI_MODE=mock` a free scripted bot
(`_shared/mockAgent.ts`) answers instead of Claude. Mock only runs for demo orgs and only understands the patterns it was written for.

```bash
npm install
supabase start                      # prints API URL, anon key, service_role key
supabase db reset                   # applies migration + seed

supabase functions serve demo-chat --env-file supabase/functions/.env
npm run dev:dashboard               # open http://localhost:5173/demo/skyline-realty
```

Env files are not in git. Create them yourself:

| File | Variables |
|---|---|
| `supabase/functions/.env` | `AI_MODE=mock` (free) or `AI_MODE=claude` + `ANTHROPIC_API_KEY=...` |
| `apps/dashboard/.env` | `VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_ANON_KEY=...` (from `supabase start`) |

## Tests

```bash
npm run test:unit                   # no backend needed
npm run test:db                     # RLS, needs supabase start
SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:acceptance
```

With `AI_MODE=claude` the acceptance run calls Claude for real (a few cents); with `AI_MODE=mock` it is free. Mobile check: open the simulator at 375px width and confirm there is no horizontal scroll.
