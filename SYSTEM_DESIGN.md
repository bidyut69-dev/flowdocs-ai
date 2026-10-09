# FlowDocs AI — System Design Addendum

> Ye file CLAUDE.md ke saath repo root me rakhni hai. CLAUDE.md = architecture + stack + schema.
> Ye file = bot ka behaviour, handoff, compliance, onboarding, aur acceptance criteria.
> Conflict ho to CLAUDE.md ke rules jeetenge, sirf yahan jo "Override" likha ho uske alawa.

---

## 1. Problem jo ye system solve karta hai

Real estate builder ke paas ads se leads aate hain, lekin:
- Pehla reply 1 ghante+ me jaata hai ya kabhi nahi jaata
- Staff ke paas leads ko follow karne ka time nahi hai
- Buyer ko budget, BHK, timing ka pata nahi chalta, to site visit book nahi hota

Ye system: lead aate hi reply, qualify, visit book, aur owner ko clean summary. Insaan closing karega.

---

## 2. Responsibility split (ye sabse important rule hai)

| Kaam | Bot | Insaan (sales person / owner) |
|---|---|---|
| Pehla reply (60 sec ke andar) | Haan | — |
| Budget, BHK, timeline poochhna | Haan | — |
| Site visit slot offer aur book | Haan | — |
| Owner ko summary alert | Haan | — |
| Visit ke time pe milna | — | Haan |
| Price negotiation, discount | Nahi (handoff) | Haan |
| Booking, token, loan, payment | Nahi (handoff) | Haan |
| Complaint, refund, legal | Nahi (handoff) | Haan |
| Follow-up nudge (AI draft) | Haan (24h window ke andar) | Override kar sakta hai |

---

## 3. Bot ki identity aur disclosure (MANDATORY)

- Bot har conversation me apne aap ko **builder ka virtual assistant** batayega. Ye CLAUDE.md ke "never mention being an AI language model" rule ke saath bhi chalta hai: bot kehta hai "virtual assistant", "AI" word bhi use kar sakta hai, lekin "language model" nahi.
- Template me disclosure hona zaroori hai. Ye code me hardcode nahi, `org_config.greeting_template` me hoga, aur `disclosure_text` field me.
- Buyer agar poochhe "kya tum bot ho / insaan ho?" to bot seedha haan bolega, aur human se milne ka option dega. Kabhi bhi insaan hone ka dikhava nahi.
- Bot ko kabhi bhi ye nahi bolna ki wo sales person hai, owner hai, ya site visit khud karega.

Pehla template (approved template hona zaroori hai, Meta ke rules ke hisaab se):

> Namaste {{name}}! Main {{builder_name}} ka virtual assistant hoon. Aapne {{project}} ke baare me poochha tha. Aapka budget aur kab tak ghar lena chahte hain, bata denge to main site visit ka slot check kar deta hoon?

---

## 4. Conversation rules

### 4.1 Qualification
- Ek message me ek sawal. Maximum 3 sawal pure flow me:
  1. Budget (range me, jaise "40-50 lakh")
  2. BHK / size
  3. Timeline (3 mahine / 6 mahine / bas dekh rahe hain)
  4. Visit kab (aaj / kal / weekend)
- Buyer agar koi sawal skip kare to zabardasti nahi. Jo mila wahi score me jaayega.
- Score logic (simple, code me tunable): timeline 3 mahine ke andar + budget config range me + visit ka time diya = `qualified`. Bas dekh rahe hain = `contacted`, follow-up me.

### 4.2 Slot booking
- Slot sirf `org_config.booking_hours` aur `slot_minutes` se aayenge, existing appointments ke minus.
- Bot kabhi bhi slot confirm karne se pehle "book ho gaya" nahi bolega. Pehle `book_appointment` tool success ho, tab confirm.
- Confirmation message me: date, time, location (project address), aur "sales team milegi" line.

### 4.3 Handoff triggers (hard rules)
Ye sab turant `handoff_to_human` call karenge: `ai_paused = true`, owner ko WhatsApp alert, aur buyer ko ek line: "Main aapko abhi team se connect karta hoon, thoda wait karein."

- Buyer khud insaan se baat karna chahe ("human", "manager", "sales wale se baat karao", "call karo")
- Complaint, gussa, abusive language
- Price negotiation ("kam karo", "discount", "best price", "last price")
- Token, booking amount, loan, payment, cheque
- Legal ya refund ki baat
- Config me jo nahi hai (naya project, koi offer jo config me nahi)
- Bot 3 baar reply na samajh paaye (confidence low)

### 4.4 Bot kya kabhi nahi karega
- Price, offer, EMI, discount invent nahi karega. Config me nahi hai to handoff.
- Possession date, RERA number, bank approval ki guarantee nahi dega (config me ho to hi bolega).
- "STOP", "not interested", "band karo" aaye to status `opted_out`, aur koi message nahi, owner ko sirf ek line log.
- Medical, legal, tax advice nahi.

---

## 5. Opt-out aur consent

- Har outbound message me opt-out ka rasta: "Message band karne ke liye STOP likhein."
- `opted_out` lead ko koi follow-up nahi jaayega, ye `followup_jobs` me bhi cancel ho.
- Lead ka phone number sirf us org ke liye use hoga. Dusre org me share nahi.
- Meta lead form se aaye lead ke liye lead form me consent text hona chahiye (builder ki zimmedari, lekin dashboard me warning dikhayein agar `consent_confirmed` false ho).

---

## 6. WhatsApp rules (Meta)

- Business-initiated message (pehla reply, follow-up after 24h) = **approved template** only.
- 24h window ke andar = free-form, AI reply allowed.
- Template library har org ke liye `message_templates` table me track ho: name, language, status (`approved` / `pending` / `rejected`), kis use ke liye (`first_reply`, `visit_reminder_24h`, `visit_reminder_2h`, `followup_1d`, etc.).
- Template approved nahi to us type ka message bheja hi nahi jaayega. Log me `event: template_missing` aayega, owner ko alert.
- WhatsApp message charges Meta ko client seedha pay karta hai. Hamare cost me nahi, lekin dashboard me count dikhana hai (`messages` table se).

---

## 7. Failure modes (har ek ka handling)

| Situation | Handling |
|---|---|
| Claude API timeout / error | Ek retry (2 sec). Fail ho to: template se "Hum jaldi reply karte hain" bhejo, `ai_paused = true`, owner ko alert |
| Meta webhook duplicate | `wa_message_id` unique, skip karo, 200 return |
| Lead ka phone invalid | Normalize fail → lead save karo `status = 'invalid_phone'`, owner ko alert, koi message nahi |
| Lead form ka data adhoora (budget/timing missing) | Bot pehle wahi poochhega jo missing hai |
| Owner ne `ai_paused` set kiya | Bot kuch nahi bolega, sirf log |
| Slot double-book hone ka chance | Booking me DB level check (exclusion constraint ya transaction) |
| Lead 24h baad reply kare | Template se re-open karna, phir free-form |

---

## 8. Owner alert format

Har alert WhatsApp pe, 5 lines se zyada nahi:

```
🔔 New lead: {{name}} ({{phone}})
Budget: {{budget}} | BHK: {{bhk}} | Timeline: {{timeline}}
Score: {{score}} | Status: {{status}}
Visit: {{visit_slot or "not booked"}}
Note: {{one_line_summary}}
```

Handoff alert me upar wali line ke saath `Reason: {{handoff_reason}}` bhi.

---

## 9. Onboarding a new client (ops, code se bahar, lekin product ka hissa)

Ye checklist admin page ke `Orgs.jsx` me dikhni chahiye, har step tick hone wala:

1. Org create karo (status `demo` se `trial`)
2. `org_config` bharo: business_name, city, services, faqs, pricing_notes (sirf wo jo builder ne confirm kiya), booking_hours, slot_minutes, owner_whatsapp
3. Handoff rules review karo (default rules copy hon, builder se confirm)
4. Greeting template submit karo Meta ko, approved hone ka wait
5. WhatsApp number connect karo (token Vault me)
6. Lead source connect karo (Meta lead form webhook ya lead-intake key)
7. Test lead bhejo, bot ka reply check karo, handoff check karo
8. Owner ko test alert milna chahiye
9. Status `active` karo

Pricing config me sirf wahi jo client ne diya. Bot pricing guess nahi karega.

---

## 10. Metrics jo dashboard me dikhenge

- First reply time (median, p90), last 7 / 30 din
- Leads → contacted → qualified → visit booked → visit done (funnel)
- Handoff count aur reasons
- Opt-out count
- Visit no-show rate

Ye numbers hi retention ka base hain. Weekly report (Monday) isi se banegi.

---

## 11. Acceptance criteria (Phase 1 demo ke liye)

- [ ] Simulator me lead submit karne par bot 5 sec ke andar pehla message dikhata hai
- [ ] Greeting me "virtual assistant" disclosure hai
- [ ] Bot 3 sawal (budget, BHK, timeline) ek-ek karke poochta hai
- [ ] Slot offer hota hai, confirm hone par appointment table me row banti hai
- [ ] "Human se baat karao" likhne par `ai_paused` true, aur handoff message aata hai
- [ ] Negotiation wale message par bot price invent nahi karta, handoff hota hai
- [ ] "STOP" par status `opted_out`, aur koi reply nahi
- [ ] Har action `events` table me log hota hai
- [ ] Mobile width par simulator bina horizontal scroll ke chalta hai
- [ ] RLS: ek org ka user dusre org ka lead nahi dekh sakta (test ke saath)

---

## 12. Claude Code ke liye instructions (is file ke upar)

- CLAUDE.md ke rules follow karo (complete file output, RLS same migration, events log).
- Phase 1 se aage ka feature mat banao (Phase 2 WhatsApp live, Phase 3 reminders/stats).
- Bot ke tone aur handoff ke rules `prompts.ts` me config se aayein, hardcode nahi.
- Koi bhi bot reply Hinglish-friendly ho, 1-3 chhoti lines, no markdown, no bullet points.
- Doubt ho to code likhne se pehle batao, andaza mat lagao.
