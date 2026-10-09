// Phase 1 acceptance run against a live demo-chat function (SYSTEM_DESIGN §11).
// Needs: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY (local `supabase start` or a project).
// Calls the real Claude API through the function, so it costs a few cents per run.
//
//   npm run test:acceptance
//
// Covered here: first message < 5s, disclosure, one-question-at-a-time qualification, slot booking
// → appointment row, human-request handoff, negotiation handoff without invented price, STOP,
// events logged. RLS is covered by supabase/tests/database/rls.test.sql; mobile width by the
// browser check in README.

const URL_ = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error("Set SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}

const SLUG = "skyline-realty";
const results = [];

function check(name, pass, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function demo(body) {
  const res = await fetch(`${URL_}/functions/v1/demo-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ANON}`, apikey: ANON },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`demo-chat ${body.action} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

async function rest(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  if (!res.ok) throw new Error(`rest ${path} → ${res.status}`);
  return res.json();
}

const randomPhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

function show(label, r) {
  for (const m of r.messages) console.log(`   ${label} ← [${m.sender}] ${m.body.replace(/\n/g, " / ")}`);
  for (const a of r.alerts) console.log(`   ${label} ⚑ owner (${a.kind}): ${a.text.split("\n")[0]}`);
}

async function say(leadId, text) {
  console.log(`   → ${text}`);
  const r = await demo({ action: "send", lead_id: leadId, text });
  show("", r);
  return r;
}

const questionCount = (s) => (s.match(/\?/g) || []).length;

// ── 1. Intake: first message fast, with disclosure + STOP line ──────────────
console.log("\n1. Lead intake");
let t0 = Date.now();
const intake = await demo({ action: "submit_lead", slug: SLUG, name: "Rahul Sharma", phone: randomPhone(), consent: true });
const elapsed = Date.now() - t0;
show("", intake);
const first = intake.messages[0]?.body ?? "";
check("first message within 5s", intake.messages.length > 0 && elapsed < 5000, `${elapsed}ms`);
check("greeting discloses virtual assistant", /virtual assistant/i.test(first));
check("greeting carries STOP line", /STOP/.test(first));
check("owner alerted on new lead", intake.alerts.some((a) => a.kind === "new_lead"));
const leadId = intake.lead.id;

// ── 2. Qualification, one question per message ────────────────────────────
console.log("\n2. Qualification");
let r = await say(leadId, "Budget around 45 lakh hai");
check("asks one question per message", r.messages.every((m) => questionCount(m.body) <= 1));
check("budget saved", Boolean(r.lead.qualification?.answers?.budget));

r = await say(leadId, "2BHK chahiye");
check("BHK saved", Boolean(r.lead.qualification?.answers?.bhk));

r = await say(leadId, "2-3 mahine me lena hai");
check("timeline saved", r.lead.qualification?.timeline_months != null);

// ── 3. Slot offer + booking ─────────────────────────────────────────────────
console.log("\n3. Visit booking");
r = await say(leadId, "Kal visit kar sakta hoon");
check("offers slots", /\d{1,2}(:\d{2})?\s?(AM|PM|baje)/i.test(r.messages.map((m) => m.body).join(" ")));

r = await say(leadId, "Pehla wala time theek hai, book kar do");
let appts = await rest(`appointments?lead_id=eq.${leadId}&status=eq.booked&select=id,starts_at`);
if (!appts.length) {
  // The model may confirm the time back first; agree once more.
  r = await say(leadId, "Haan confirm hai");
  appts = await rest(`appointments?lead_id=eq.${leadId}&status=eq.booked&select=id,starts_at`);
}
check("appointment row created", appts.length === 1);
check("lead status booked", r.lead.status === "booked");
check("owner alerted on booking", r.alerts.some((a) => a.kind === "visit_booked"));
const confirm = r.messages.map((m) => m.body).join(" ");
check("confirmation mentions location", /new town|action area|plot 7/i.test(confirm));

// ── 4. Human request → handoff ──────────────────────────────────────────────
console.log("\n4. Human handoff");
const h = await demo({ action: "submit_lead", slug: SLUG, name: "Priya Das", phone: randomPhone(), consent: true });
r = await say(h.lead.id, "Mujhe kisi insaan se baat karni hai, sales wale se baat karao");
check("handoff outcome", r.outcome === "handoff");
check("ai_paused set", r.lead.ai_paused === true);
check("handoff message sent", r.messages.some((m) => /team se connect/i.test(m.body)));
r = await say(h.lead.id, "Hello?");
check("AI stays silent while paused", r.outcome === "paused" && r.messages.length === 0);

// ── 5. Negotiation → handoff, no invented price ────────────────────────────
console.log("\n5. Negotiation");
const n = await demo({ action: "submit_lead", slug: SLUG, name: "Amit Roy", phone: randomPhone(), consent: true });
r = await say(n.lead.id, "Last price kya hai 2BHK ka? Thoda discount do na");
check("negotiation hands off", r.outcome === "handoff");
const aiText = r.messages.filter((m) => m.sender === "ai").map((m) => m.body).join(" ");
check("no price invented", !/\d+\s*(lakh|lac|L\b|cr|crore|%|rs|₹)/i.test(aiText));

// ── 6. STOP ─────────────────────────────────────────────────────────────────
console.log("\n6. Opt-out");
const s = await demo({ action: "submit_lead", slug: SLUG, name: "Sneha Paul", phone: randomPhone(), consent: true });
r = await say(s.lead.id, "STOP");
check("STOP → opted_out", r.outcome === "opted_out" && r.lead.status === "opted_out");
check("no reply to STOP", r.messages.length === 0);
check("owner told about opt-out", r.alerts.some((a) => a.kind === "opt_out"));
r = await say(s.lead.id, "hello");
check("no messages after opt-out", r.messages.length === 0);

// ── 7. Events ──────────────────────────────────────────────────────────────
console.log("\n7. Events");
const types = new Set(
  (await rest(`events?lead_id=in.(${leadId},${h.lead.id},${s.lead.id})&select=type`)).map((e) => e.type),
);
for (const t of ["lead_created", "first_reply_sent", "owner_alert", "message_in", "lead_updated", "appointment_booked", "ai_reply", "handoff", "opted_out"]) {
  check(`event logged: ${t}`, types.has(t));
}

const failed = results.filter((x) => !x.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
