# FlowDocs AI — Decisions (Phase 1 se pehle ye final maan lo)

> Ye file CLAUDE.md aur SYSTEM_DESIGN.md ke upar hai. Conflict ho to ye file jeetegi.

## A. Claude Code ke open sawal — decisions

1. **Qualification sawal kahan se aayenge?**
   Hardcode nahi. `org_config.qualification_questions` (jsonb) se aayenge. Seed me real estate ke default sawal (budget, BHK, timeline, visit time) hain. Clinic ya coaching org me sawal alag honge, code change nahi.

2. **STOP line vs 1–3 lines ka rule?**
   - Template (pehla message aur follow-up templates) me STOP line zaroor hogi: "Band karne ke liye STOP likhein."
   - Free-form AI replies me STOP line nahi, wo 1–3 chhoti lines me rahenge.
   - Buyer "STOP" likhe to status `opted_out`, koi reply nahi.

3. **Opt-out pe owner ko kya jaaye?**
   Dono: `events` me log, aur owner ko ek line ka WhatsApp alert: "{{name}} ne message band karne ko kaha (STOP)."

4. **Phase 1 demo me owner alert?**
   Toast bhi dikhega aur `events` me row bhi banegi. Dono ek saath.

5. **Pehle upar ke points tay karne hain ya Phase 1 shuru?**
   Ye file tay hai, to Phase 1 shuru karo. Schema migration is file ke hisaab se.

## B. Schema fixes (CLAUDE.md me ye add hona hai)

**org_config me add:**
- `greeting_template text`
- `disclosure_text text` (default: "Main {{builder_name}} ka virtual assistant hoon.")
- `project_address text` (confirmation message ke liye)
- `budget_ranges jsonb` (score logic ke liye, jaise `[{"label":"40-50L","min":4000000,"max":5000000}]`)
- `lead_consent_confirmed boolean default false` (org-level: builder ne lead form me consent text confirm kiya)

**leads me add:**
- `qualification jsonb default '{}'` (budget, bhk, timeline, visit_pref collected yahan rahenge, ek jagah, columns nahi)
- `unclear_count int default 0` ("3 baar samajh nahi paaya" counter; 3 hone pe handoff)
- status list me `invalid_phone` (already decided hai, list me add karna hai)

**Nayi table: `message_templates`**
```
message_templates  id, org_id, name, language, use_case
                   ('first_reply'|'visit_reminder_24h'|'visit_reminder_2h'|'followup'|'owner_alert'|'handoff_ack'),
                   status('approved'|'pending'|'rejected'), meta_template_id, created_at
```
RLS same migration me.

**Consent:** `lead_consent_confirmed` org_config me hai (table nahi). Dashboard me warning dikhegi agar false ho.

## C. Demo vs live

- Demo (Phase 1) me disclosure, STOP line, handoff, aur owner alert sab simulator me dikhenge.
- Live (Phase 2) me same logic, bas WhatsApp send ka adapter alag.

## D. Claude Code ko ye bolna

"DECISIONS.md, CLAUDE.md, SYSTEM_DESIGN.md pura padho. Schema B section ke hisaab se migration banao (RLS same migration me). Phase 1 shuru karo, aur SYSTEM_DESIGN section 11 ke acceptance criteria pe test karo."
