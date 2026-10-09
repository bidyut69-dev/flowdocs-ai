// Mock agent tests: full scripted conversations against in-memory tool handlers
// that mirror conversation.ts (same scoring, same slot maths, no database).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ToolHandlers } from "../../supabase/functions/_shared/agent.ts";
import { parseBudget, parseTimeline, pickSlot, runMockAgent, to24 } from "../../supabase/functions/_shared/mockAgent.ts";
import { nextStatus, scoreLead } from "../../supabase/functions/_shared/scoring.ts";
import { computeSlots } from "../../supabase/functions/_shared/slots.ts";
import { formatIstClock, formatIstDay, istTime, istToUtc } from "../../supabase/functions/_shared/time.ts";
import type { MessageRow, OrgConfig, Qualification } from "../../supabase/functions/_shared/types.ts";
import { dental, lead as makeLead, realEstate } from "./fixtures.ts";

const NOW = new Date("2026-10-09T04:30:00Z"); // Fri 9 Oct, 10:00 IST. Fixture hours: Sat/Sun 10:00-13:00.

function harness(config: OrgConfig) {
  const lead = makeLead({ qualification: {} });
  const booked: { starts_at: Date; ends_at: Date }[] = [];
  const history: MessageRow[] = [];
  const calls: string[] = [];
  let handoff: { category: string; reason: string } | null = null;

  const msg = (direction: "in" | "out", sender: MessageRow["sender"], body: string): MessageRow => ({
    id: String(history.length), org_id: "org-1", lead_id: lead.id, direction, sender, body,
    wa_message_id: null, template_name: null, status: null, created_at: NOW.toISOString(),
  });

  const slotsFor = (date: string) =>
    computeSlots({ date, bookingHours: config.booking_hours, slotMinutes: config.slot_minutes, booked, now: NOW });

  const handlers: ToolHandlers = {
    async get_available_slots({ date }) {
      calls.push("get_available_slots");
      const d = String(date);
      return {
        result: {
          date: d,
          day: formatIstDay(istToUtc(d, "12:00")!),
          slots: slotsFor(d).map((s) => ({ value: `${d} ${istTime(s.starts_at)}`, label: formatIstClock(s.starts_at) })),
        },
      };
    },
    async book_appointment({ starts_at }) {
      calls.push("book_appointment");
      const [date, time] = String(starts_at).split(" ");
      const slot = slotsFor(date).find((s) => istTime(s.starts_at) === time);
      if (!slot) return { result: { ok: false, reason: "not_available", alternatives: [] } };
      booked.push(slot);
      lead.status = "booked";
      lead.qualification = { ...lead.qualification, visit_slot: `${formatIstDay(slot.starts_at)}, ${formatIstClock(slot.starts_at)}` };
      return { result: { ok: true, date: formatIstDay(slot.starts_at), time: formatIstClock(slot.starts_at), location: config.project_address } };
    },
    async update_lead(input) {
      calls.push("update_lead");
      const prev = lead.qualification ?? {};
      const q: Qualification = { ...prev, answers: { ...(prev.answers ?? {}), ...(input.answers as Record<string, string>) } };
      if (typeof input.budget_min_inr === "number") q.budget_min_inr = input.budget_min_inr;
      if (typeof input.budget_max_inr === "number") q.budget_max_inr = input.budget_max_inr;
      if (typeof input.timeline_months === "number") q.timeline_months = input.timeline_months;
      const score = scoreLead(q, config.qualification_questions, config.budget_ranges);
      lead.qualification = q;
      lead.score = score.score;
      lead.status = nextStatus(lead.status, score.qualified);
      return { result: { saved: true, status: lead.status, still_to_ask: score.missing } };
    },
    async handoff_to_human(input) {
      calls.push("handoff_to_human");
      handoff = { category: String(input.category), reason: String(input.reason) };
      return { result: { ok: true }, terminal: "handoff" };
    },
    async mark_unclear() {
      calls.push("mark_unclear");
      lead.unclear_count += 1;
      return lead.unclear_count >= 3 ? { result: { ok: true }, terminal: "handoff" } : { result: { count: lead.unclear_count } };
    },
    async opt_out() {
      calls.push("opt_out");
      return { result: { ok: true }, terminal: "opt_out" };
    },
  };

  async function say(text: string) {
    history.push(msg("in", "lead", text));
    const r = await runMockAgent({ text, lead, config, history, now: NOW, handlers });
    if (r.reply) history.push(msg("out", "ai", r.reply));
    return r;
  }

  return { say, lead, calls, getHandoff: () => handoff, booked };
}

describe("mock agent: full real-estate flow (same script as the acceptance test)", () => {
  it("qualifies one question at a time, offers slots, books", async () => {
    const h = harness(realEstate);

    let r = await h.say("Budget around 45 lakh hai");
    assert.equal(h.lead.qualification.answers?.budget, "45L");
    assert.equal(h.lead.qualification.budget_min_inr, 4_500_000);
    assert.match(r.reply!, /BHK\?/);
    assert.ok((r.reply!.match(/\?/g) ?? []).length <= 1, "one question per message");

    r = await h.say("2BHK chahiye");
    assert.equal(h.lead.qualification.answers?.bhk, "2BHK");
    assert.match(r.reply!, /Kab tak\?/);

    r = await h.say("2-3 mahine me lena hai");
    assert.equal(h.lead.qualification.timeline_months, 3);
    assert.match(r.reply!, /Visit kab\?/);

    r = await h.say("Kal visit kar sakta hoon");
    assert.equal(r.reply, "Shukriya! Sat, 10 Oct ko ye time khali hain: 10:00 AM, 11:00 AM, 12:00 PM. Kaunsa time theek rahega?");
    assert.equal(h.lead.status, "qualified");

    r = await h.say("Pehla wala time theek hai, book kar do");
    assert.match(r.reply!, /Sat, 10 Oct, 10:00 AM ko book ho gaya/);
    assert.match(r.reply!, /Plot 7, New Town/);
    assert.match(r.reply!, /team aapse wahan milegi/);
    assert.equal(h.lead.status, "booked");
    assert.equal(h.booked.length, 1);

    r = await h.say("ok thanks");
    assert.match(r.reply!, /booked hai/);
    assert.equal(h.booked.length, 1, "no double booking");
  });

  it("takes several answers from one message", async () => {
    const h = harness(realEstate);
    const r = await h.say("45 lakh, 2BHK, 3 mahine me");
    assert.deepEqual(h.lead.qualification.answers, { budget: "45L", bhk: "2BHK", timeline: "3 mahine" });
    assert.match(r.reply!, /Visit kab\?/);
  });

  it("books by time, not just ordinal", async () => {
    const h = harness(realEstate);
    await h.say("45 lakh, 2BHK, 3 mahine me");
    await h.say("kal");
    const r = await h.say("11 baje");
    assert.match(r.reply!, /11:00 AM ko book ho gaya/);
  });

  it("re-asks the times when the pick isn't clear", async () => {
    const h = harness(realEstate);
    await h.say("45 lakh, 2BHK, 3 mahine me");
    await h.say("weekend");
    const r = await h.say("hmm");
    assert.match(r.reply!, /Kaunsa time theek rahega\? 10:00 AM, 11:00 AM, 12:00 PM/);
    assert.ok(!h.calls.includes("book_appointment"));
  });
});

describe("mock agent: handoff and guard rails", () => {
  const cases: [string, string][] = [
    ["Mujhe kisi insaan se baat karni hai, sales wale se baat karao", "human_requested"],
    ["Last price kya hai 2BHK ka? Thoda discount do na", "negotiation"],
    ["Loan milega kya?", "payment"],
    ["Ye fraud hai kya", "complaint"],
    ["Refund kab milega", "legal_refund"],
  ];
  for (const [text, category] of cases) {
    it(`hands off: "${text}"`, async () => {
      const h = harness(realEstate);
      const r = await h.say(text);
      assert.equal(r.terminal, "handoff");
      assert.equal(r.reply, null, "no AI text: the system sends the handoff line");
      assert.equal(h.getHandoff()?.category, category);
    });
  }

  it("answers 'are you a bot?' honestly without handing off", async () => {
    const h = harness(realEstate);
    const r = await h.say("Kya aap bot ho?");
    assert.match(r.reply!, /Haan\. Main Skyline Realty ka virtual assistant hoon/);
    assert.equal(r.terminal, null);
  });

  it("answers from FAQs and steers back to the current question", async () => {
    const h = harness(realEstate);
    const r = await h.say("RERA number kya hai?");
    assert.match(r.reply!, /WBRERA\/P\/NOR\/2025\/001234 Budget\?/);
  });

  it("quotes only configured pricing, and saves answers in the same message", async () => {
    const h = harness(realEstate);
    const r = await h.say("2BHK ka price kya hai?");
    assert.match(r.reply!, /^2BHK starting 48 lakh/);
    assert.equal(h.lead.qualification.answers?.bhk, "2BHK");
  });

  it("hands off a price question when the org has no pricing", async () => {
    const h = harness({ ...realEstate, pricing_notes: null });
    const r = await h.say("price kya hai?");
    assert.equal(r.terminal, "handoff");
    assert.equal(h.getHandoff()?.category, "out_of_scope");
  });

  it("hands off a question it has no facts for (never guesses)", async () => {
    const h = harness(realEstate);
    const r = await h.say("Swimming pool kitna bada hai?");
    assert.equal(r.terminal, "handoff");
  });

  it("third unclear message hands off", async () => {
    const h = harness(realEstate);
    assert.match((await h.say("asdf qwer")).reply!, /samajh nahi aaya\. Budget\?/);
    assert.equal((await h.say("zzz")).terminal, null);
    const r = await h.say("lol");
    assert.equal(r.terminal, "handoff");
    assert.equal(h.lead.unclear_count, 3);
  });

  it("greetings don't count as unclear", async () => {
    const h = harness(realEstate);
    const r = await h.say("Hello");
    assert.equal(r.reply, "Ji! Budget?");
    assert.equal(h.lead.unclear_count, 0);
  });
});

describe("mock agent: questions come from config", () => {
  it("dental org asks its own questions and saves free-text answers", async () => {
    const h = harness(dental);
    let r = await h.say("Implant ke liye");
    assert.equal(h.lead.qualification.answers?.treatment, "Implant ke liye");
    assert.match(r.reply!, /Kab\?/);
    r = await h.say("abhi turant");
    assert.equal(h.lead.qualification.timeline_months, 0);
    assert.match(r.reply!, /Consultation kab\?/);
  });
});

describe("mock agent parsers", () => {
  it("budget", () => {
    assert.deepEqual(parseBudget("40-50 lakh", false), { min: 4e6, max: 5e6, label: "40L-50L" });
    assert.deepEqual(parseBudget("1.2 cr", false), { min: 1.2e7, max: 1.2e7, label: "1.2 Cr" });
    assert.equal(parseBudget("45l tak", false)?.min, 4.5e6);
    assert.equal(parseBudget("45", true)?.min, 4.5e6);
    assert.equal(parseBudget("45", false), null);
    assert.equal(parseBudget("mera number 9876543210 hai", true), null, "phone numbers are not budgets");
    assert.equal(parseBudget("2bhk", true), null);
  });

  it("timeline", () => {
    assert.equal(parseTimeline("6 mahine", false)?.months, 6);
    assert.equal(parseTimeline("do mahine me", false)?.months, 2);
    assert.equal(parseTimeline("1 saal", false)?.months, 12);
    assert.equal(parseTimeline("bas dekh rahe hain", true)?.months, 99);
    assert.equal(parseTimeline("abhi", true)?.months, 0);
    assert.equal(parseTimeline("abhi 2bhk dekh raha", false), null, "only strong signals for a non-current question");
  });

  it("slot picking and 24h conversion", () => {
    const times = ["10:00 AM", "11:00 AM", "12:00 PM"];
    assert.equal(pickSlot("pehla wala", times), "10:00 AM");
    assert.equal(pickSlot("doosra", times), "11:00 AM");
    assert.equal(pickSlot("12 baje", times), "12:00 PM");
    assert.equal(pickSlot("last wala", times), "12:00 PM");
    assert.equal(pickSlot("haan", times), null, "ambiguous with several options");
    assert.equal(pickSlot("haan", ["11:00 AM"]), "11:00 AM");
    assert.equal(to24("1:30 PM"), "13:30");
    assert.equal(to24("12:00 AM"), "00:00");
    assert.equal(to24("12:00 PM"), "12:00");
  });
});
