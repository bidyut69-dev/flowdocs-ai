// Unit tests for the pure _shared modules. Run: npm run test:unit (node --test, native TS).

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOptOut } from "../../supabase/functions/_shared/optout.ts";
import { normalizePhone } from "../../supabase/functions/_shared/phone.ts";
import { buildSystemPrompt, buildTurnState } from "../../supabase/functions/_shared/prompts.ts";
import { nextStatus, scoreLead } from "../../supabase/functions/_shared/scoring.ts";
import { computeSlots } from "../../supabase/functions/_shared/slots.ts";
import { formatOwnerAlert, renderGreeting, STOP_LINE } from "../../supabase/functions/_shared/templates.ts";
import { formatIstClock, formatIstDay, istDate, istToUtc } from "../../supabase/functions/_shared/time.ts";

import { dental, lead, realEstate } from "./fixtures.ts";

describe("normalizePhone", () => {
  it("normalizes Indian mobile formats to E.164", () => {
    assert.equal(normalizePhone("98765 43210"), "+919876543210");
    assert.equal(normalizePhone("098765-43210"), "+919876543210");
    assert.equal(normalizePhone("919876543210"), "+919876543210");
    assert.equal(normalizePhone("+91 98765 43210"), "+919876543210");
    assert.equal(normalizePhone("0091 9876543210"), "+919876543210");
    assert.equal(normalizePhone("+1 415 555 0100"), "+14155550100");
  });

  it("rejects junk", () => {
    assert.equal(normalizePhone(""), null);
    assert.equal(normalizePhone("12345"), null);
    assert.equal(normalizePhone("abcdefghij"), null);
    assert.equal(normalizePhone("5876543210"), null); // Indian mobiles start 6-9
    assert.equal(normalizePhone("+91 5876543210"), null);
  });
});

describe("IST time", () => {
  it("converts IST wall clock to UTC and back", () => {
    const d = istToUtc("2026-10-10", "11:00")!;
    assert.equal(d.toISOString(), "2026-10-10T05:30:00.000Z");
    assert.equal(istDate(new Date("2026-10-09T19:00:00Z")), "2026-10-10"); // 00:30 IST next day
    assert.equal(formatIstDay(d), "Sat, 10 Oct");
    assert.equal(formatIstClock(d), "11:00 AM");
    assert.equal(formatIstClock(istToUtc("2026-10-10", "00:15")!), "12:15 AM");
  });

  it("rejects impossible dates", () => {
    assert.equal(istToUtc("2026-02-31", "10:00"), null);
    assert.equal(istToUtc("2026-10-10", "25:00"), null);
  });
});

describe("computeSlots", () => {
  const now = new Date("2026-10-09T04:30:00Z"); // Fri 10:00 IST

  it("chops booking hours into slots for the right weekday", () => {
    const slots = computeSlots({ date: "2026-10-10", bookingHours: realEstate.booking_hours, slotMinutes: 60, booked: [], now });
    assert.deepEqual(slots.map((s) => formatIstClock(s.starts_at)), ["10:00 AM", "11:00 AM", "12:00 PM"]);
  });

  it("returns nothing on a closed day", () => {
    assert.equal(computeSlots({ date: "2026-10-12", bookingHours: realEstate.booking_hours, slotMinutes: 60, booked: [], now }).length, 0);
  });

  it("removes booked and too-soon slots", () => {
    const booked = [{ starts_at: istToUtc("2026-10-10", "11:00")!, ends_at: istToUtc("2026-10-10", "12:00")! }];
    const soon = istToUtc("2026-10-10", "09:30")!; // 10:00 slot is < 60 min away
    const slots = computeSlots({ date: "2026-10-10", bookingHours: realEstate.booking_hours, slotMinutes: 60, booked, now: soon });
    assert.deepEqual(slots.map((s) => formatIstClock(s.starts_at)), ["12:00 PM"]);
  });
});

describe("scoring", () => {
  const q = realEstate.qualification_questions;

  it("qualifies: timeline <= 3 months + budget in range + visit time", () => {
    const r = scoreLead({
      answers: { budget: "45 lakh", bhk: "2BHK", timeline: "2 mahine", visit_pref: "weekend" },
      budget_min_inr: 4_500_000,
      budget_max_inr: 4_500_000,
      timeline_months: 2,
    }, q, realEstate.budget_ranges);
    assert.equal(r.qualified, true);
    assert.equal(r.score, 75); // 25 budget + 10 BHK + 25 timeline + 15 visit day; booking adds the last 25
    assert.deepEqual(r.missing, []);
  });

  it("just browsing stays contacted", () => {
    const r = scoreLead({ answers: { budget: "45L", timeline: "bas dekh rahe" }, budget_min_inr: 4_500_000, timeline_months: 99 }, q, realEstate.budget_ranges);
    assert.equal(r.qualified, false);
    assert.equal(nextStatus("contacted", r.qualified), "contacted");
    assert.deepEqual(r.missing, ["bhk", "visit_pref"]);
  });

  it("budget outside every range does not qualify", () => {
    const r = scoreLead({ answers: { budget: "20L", bhk: "2", timeline: "1", visit_pref: "kal" }, budget_min_inr: 2_000_000, timeline_months: 1 }, q, realEstate.budget_ranges);
    assert.equal(r.qualified, false);
  });

  it("orgs without a budget question can still qualify", () => {
    const r = scoreLead({ answers: { treatment: "implant", timeline: "next month", visit_pref: "Saturday" }, timeline_months: 1 }, dental.qualification_questions, []);
    assert.equal(r.qualified, true);
  });

  it("never moves a lead out of booked / opted_out", () => {
    assert.equal(nextStatus("booked", false), "booked");
    assert.equal(nextStatus("opted_out", true), "opted_out");
    assert.equal(nextStatus("contacted", true), "qualified");
  });
});

describe("isOptOut", () => {
  for (const t of ["STOP", "stop.", "Stop!!", "stop pls", "not interested", "Not interested anymore", "band karo", "Message mat bhejo", "don't message me", "बंद करो"]) {
    it(`detects "${t}"`, () => assert.equal(isOptOut(t), true));
  }
  for (const t of ["Mujhe 2BHK chahiye", "bus stop ke paas hai?", "stop by kal 11 baje aa sakta hoon", "interested hoon", ""]) {
    it(`ignores "${t}"`, () => assert.equal(isOptOut(t), false));
  }
});

describe("templates", () => {
  it("greeting has disclosure, project, first name and the STOP line", () => {
    const g = renderGreeting(realEstate, { name: "Rahul Sharma" }, "Skyline Greens");
    assert.match(g, /^Namaste Rahul!/);
    assert.match(g, /Skyline Realty ka virtual assistant/);
    assert.match(g, /Skyline Greens/);
    assert.ok(g.endsWith(STOP_LINE));
  });

  it("greeting still discloses if the template forgot the placeholder", () => {
    const g = renderGreeting({ ...realEstate, greeting_template: "Hi {{name}}, budget?" }, { name: "Asha" }, "X");
    assert.match(g, /virtual assistant/);
  });

  it("owner alerts are at most 5 lines and handoff carries the reason", () => {
    const l = lead({ qualification: { answers: { budget: "45L", bhk: "2BHK" }, summary: "Hot lead" }, score: 60, status: "qualified" });
    const a = formatOwnerAlert("new_lead", l, realEstate.qualification_questions);
    assert.ok(a.split("\n").length <= 5);
    assert.match(a, /Budget: 45L \| BHK: 2BHK \| Timeline: -/);
    assert.match(a, /Note: Hot lead/);
    const h = formatOwnerAlert("handoff", l, realEstate.qualification_questions, { reason: "negotiation: wants discount" });
    assert.ok(h.split("\n").length <= 5);
    assert.match(h, /Reason: negotiation: wants discount/);
  });
});

describe("prompts", () => {
  it("system prompt is built from config and is lead-independent (cacheable)", () => {
    const p = buildSystemPrompt(realEstate);
    assert.match(p, /CUSTOM-HANDOFF-RULES-FROM-CONFIG/);
    assert.match(p, /\[budget\] Budget\?/);
    assert.match(p, /Skyline Realty ka virtual assistant/);
    assert.equal(p, buildSystemPrompt(structuredClone(realEstate)));
    assert.doesNotMatch(p, /\d{4}-\d{2}-\d{2}/); // no dates → stable cache prefix
  });

  it("dental org gets its own questions, not real-estate ones", () => {
    const p = buildSystemPrompt(dental);
    assert.match(p, /\[treatment\]/);
    assert.doesNotMatch(p, /\[bhk\]/);
  });

  it("turn state lists what is still missing", () => {
    const l = lead({ qualification: { answers: { budget: "45L" } } });
    const s = buildTurnState(l, scoreLead(l.qualification, realEstate.qualification_questions, realEstate.budget_ranges), new Date("2026-10-09T04:30:00Z"));
    assert.match(s, /Still to ask \(in order\): bhk, timeline, visit_pref/);
    assert.match(s, /2026-10-09 \(Fri, 9 Oct, today\)/);
  });
});
