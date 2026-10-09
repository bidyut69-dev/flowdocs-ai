// Scripted stand-in for the Claude agent (AI_MODE=mock). Free to run, deterministic, demo orgs only.
//
// It drives the same tool handlers as agent.ts, so the database, booking, handoff, opt-out,
// events and owner alerts behave exactly as they will with Claude. What it can't do is
// understand free-form language: it only recognises the patterns below.

import type { AgentResult, ToolCallLog, ToolHandlers, ToolOutcome } from "./agent.ts";
import { scoreLead } from "./scoring.ts";
import { renderDisclosure } from "./templates.ts";
import { addIstDays, formatIstDay, istDate, istParts, istToUtc } from "./time.ts";
import type { Lead, MessageRow, OrgConfig } from "./types.ts";

export interface MockInput {
  text: string;
  lead: Lead;
  config: OrgConfig;
  history: MessageRow[]; // includes the inbound message being answered
  now: Date;
  handlers: ToolHandlers;
}

// ─── Patterns ──────────────────────────────────────────────────────────────

const BOT_QUESTION =
  /\b(bot|robot|ai|machine)\s*(ho|hai|hain|ho kya)\b|are you (a |an )?(bot|human|robot|real|ai)|\b(insaan|human|real person|asli)\s*(ho|hai)\b/;

const HANDOFF: [category: string, pattern: RegExp, reason: string][] = [
  ["complaint", /(complaint|shikayat|fraud|cheat|dhokha|bakwas|worst|bekar service|pagal|bewakoof|gussa)/, "Complaint ya gussa"],
  ["legal_refund", /(legal|lawyer|vakil|court|refund|paise wapas|paisa wapas)/, "Legal ya refund ki baat"],
  ["negotiation", /(discount|best price|last price|final price|kam karo|kam kar do|kam ho sakta|negotiat|bargain|offer)/, "Price negotiation"],
  ["payment", /(token|booking amount|advance|loan|\bemi\b|payment|pay kar|cheque|bank)/, "Payment, loan ya token ki baat"],
  ["human_requested", /(human|insaan|manager|sales (wale|wala|team|person)|salesperson|executive|call (karo|kar do|kijiye|me|back)|phone karo|baat kar(ao|wao|ni|na|wa do))/, "Lead ne insaan se baat maangi"],
];

const PRICE = /(price|rate|kitne ka|kitna ka|kitne me|cost|kimat|keemat|daam|charges?|fees?)/;
const QUESTION_WORD = /(\?|\b(kya|kab|kahan|kaha|kaise|kitna|kitne|kaun|kaunsa|kyun|what|when|where|how|which|why)\b)/;
const GREETING = /^(hi+|hello+|hey+|helo|namaste|namaskar|ok+|okay|haan|ha|ji|yes|thik hai|theek hai|thanks|thank you|dhanyavad|shukriya)[\s!.]*$/;
const SKIP = /(nahi batana|nahi bataunga|nahi bataungi|skip|baad me bata|pass\b)/;
const AFFIRM = /^(haan|ha|ok|okay|yes|theek|thik|done|confirm|chalega|perfect|sahi)/;
const RESCHEDULE = /(reschedule|change|badal|dusra time|doosra time|cancel)/;
const VISIT_VERB = /(visit|aa sakta|aa sakti|aaunga|aaungi|aa jaunga|aa jaungi|milte|milna|dekhne aa|site|consultation|appointment)/;

const WORD_NUM: Record<string, number> = {
  ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, chaar: 4, four: 4, paanch: 5, panch: 5,
  five: 5, chhe: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8, nau: 9, nine: 9, das: 10, ten: 10,
};
const NUM = `(\\d+(?:\\.\\d+)?|\\b(?:${Object.keys(WORD_NUM).join("|")})\\b)`;
const toNum = (s: string) => WORD_NUM[s] ?? Number(s);

const norm = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/\s+/g, " ").trim();

// ─── Extractors ────────────────────────────────────────────────────────────

const BUDGET_UNIT = "(lakhs?|lacs?|l|crores?|cr)";
const BUDGET_RANGE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(?:-|to|se)\\s*(\\d+(?:\\.\\d+)?)\\s*${BUDGET_UNIT}\\b`);
const BUDGET_ONE = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${BUDGET_UNIT}\\b`);

function inrLabel(n: number): string {
  return n >= 1e7 ? `${+(n / 1e7).toFixed(2)} Cr` : `${+(n / 1e5).toFixed(1)}L`;
}

export function parseBudget(t: string, isCurrent: boolean): { min: number; max: number; label: string } | null {
  const mult = (u: string) => (u.startsWith("c") ? 1e7 : 1e5);
  let min: number | undefined;
  let max: number | undefined;
  const r = BUDGET_RANGE.exec(t);
  const o = BUDGET_ONE.exec(t);
  if (r) {
    min = Number(r[1]) * mult(r[3]);
    max = Number(r[2]) * mult(r[3]);
  } else if (o) {
    min = max = Number(o[1]) * mult(o[2]);
  } else if (isCurrent && /^\d{6,9}$/.test(t)) {
    min = max = Number(t); // plain rupees, only as a direct answer, so a phone number is never read as a budget
  } else if (isCurrent && /^\d{1,3}(\.\d+)?$/.test(t)) {
    min = max = Number(t) * 1e5; // a bare "45" in answer to the budget question means lakh
  }
  if (min === undefined || max === undefined) return null;
  const label = min === max ? inrLabel(min) : `${inrLabel(min)}-${inrLabel(max)}`;
  return { min, max, label };
}

export function parseTimeline(t: string, isCurrent: boolean): { months: number; label: string } | null {
  const label = (m: number) => (m === 0 ? "Turant" : m >= 99 ? "Bas dekh rahe" : `${m} mahine`);
  if (isCurrent && /(abhi|turant|immediate|jaldi|asap|isi mahine|this month|right now)/.test(t)) return { months: 0, label: label(0) };
  if (isCurrent && /(dekh rah|browsing|just looking|pata nahi|no plan|not sure|soch rah|decide nahi)/.test(t)) {
    return { months: 99, label: label(99) };
  }
  const mo = new RegExp(`${NUM}\\s*(?:-|to|se)?\\s*${NUM}?\\s*(mahine|mahina|mahino|months?|mnths?)`).exec(t);
  if (mo) {
    const m = toNum(mo[2] ?? mo[1]);
    return { months: m, label: label(m) };
  }
  const yr = new RegExp(`${NUM}\\s*(saal|sal|years?|yrs?)`).exec(t);
  if (yr) {
    const m = Math.round(toNum(yr[1]) * 12);
    return { months: m, label: label(m) };
  }
  if (isCurrent && /^\d{1,2}$/.test(t)) return { months: Number(t), label: label(Number(t)) };
  return null;
}

const DAY_WORDS: [RegExp, number][] = [
  [/\b(sunday|ravivar|itwar)\b/, 0],
  [/\b(monday|somvar)\b/, 1],
  [/\b(tuesday|mangalvar)\b/, 2],
  [/\b(wednesday|budhvar)\b/, 3],
  [/\b(thursday|guruvar)\b/, 4],
  [/\b(friday|shukravar)\b/, 5],
  [/\b(saturday|shanivar)\b/, 6],
];

export function parseVisit(t: string, now: Date, isCurrent: boolean): { date: string; label: string } | null {
  if (!isCurrent && !VISIT_VERB.test(t)) return null;
  const today = istDate(now);
  const dow = istParts(now).dow;
  const at = (d: string) => ({ date: d, label: formatIstDay(istToUtc(d, "12:00")!) });

  if (/\b(aaj|today)\b/.test(t)) return at(today);
  if (/\b(parso|day after tomorrow)\b/.test(t)) return at(addIstDays(today, 2));
  if (/\b(kal|kl|tomorrow)\b/.test(t)) return at(addIstDays(today, 1));
  if (/\bweekend\b/.test(t)) return at(addIstDays(today, dow === 6 || dow === 0 ? 0 : 6 - dow));
  for (const [re, target] of DAY_WORDS) {
    if (re.test(t)) return at(addIstDays(today, (target - dow + 7) % 7));
  }
  return null;
}

function parseBhk(t: string, isCurrent: boolean): string | null {
  const m = /(\d)\s*(bhk|bed|bedroom)/.exec(t);
  if (m) return `${m[1]}BHK`;
  if (isCurrent && /^\d$/.test(t)) return `${t}BHK`;
  return null;
}

interface Extracted {
  answers: Record<string, string>;
  budget_min_inr?: number;
  budget_max_inr?: number;
  timeline_months?: number;
  visitDate?: string;
}

function extract(t: string, raw: string, missing: string[], now: Date): Extracted {
  const out: Extracted = { answers: {} };
  const current = missing[0];

  for (const key of missing) {
    const isCur = key === current;
    if (key === "budget") {
      const b = parseBudget(t, isCur);
      if (b) {
        out.answers.budget = b.label;
        out.budget_min_inr = b.min;
        out.budget_max_inr = b.max;
      }
    } else if (key === "timeline") {
      const tl = parseTimeline(t, isCur);
      if (tl) {
        out.answers.timeline = tl.label;
        out.timeline_months = tl.months;
      }
    } else if (key === "visit_pref") {
      const v = parseVisit(t, now, isCur);
      if (v) {
        out.answers.visit_pref = v.label;
        out.visitDate = v.date;
      }
    } else if (key === "bhk") {
      const b = parseBhk(t, isCur);
      if (b) out.answers.bhk = b;
    } else if (isCur && !GREETING.test(t) && !QUESTION_WORD.test(t) && raw.trim().length <= 120) {
      out.answers[key] = raw.trim();
    }

    if (isCur && !out.answers[key] && SKIP.test(t)) out.answers[key] = "nahi bataya";
  }
  return out;
}

// ─── Info answers (FAQ / pricing) ──────────────────────────────────────────

const STOPWORDS = new Set(["kya", "hai", "hain", "milegi", "milega", "aapka", "aapke", "what", "this", "that"]);

function faqAnswer(t: string, config: OrgConfig): string | null {
  if (!QUESTION_WORD.test(t)) return null;
  let best: { a: string; hits: number } | null = null;
  for (const f of config.faqs) {
    const words = norm(f.q).replace(/[^a-z0-9\s]/g, " ").split(" ").filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    const hits = words.filter((w) => t.includes(w)).length;
    if (hits > 0 && (!best || hits > best.hits)) best = { a: f.a, hits };
  }
  return best?.a ?? null;
}

// ─── Slot offers ───────────────────────────────────────────────────────────

// Offers may carry a prefix ("Shukriya! ..."), so match the day label itself, not the line start.
const OFFER_RE = /([A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2}) ko ye time khali hain: (.+?)\. Kaunsa time theek rahega\?$/;

function offerText(dayLabel: string, labels: string[]): string {
  return `${dayLabel} ko ye time khali hain: ${labels.join(", ")}. Kaunsa time theek rahega?`;
}

/** "Sat, 10 Oct" → "2026-10-10", looking at the next two weeks. */
function dateFromLabel(label: string | undefined, now: Date): string | null {
  if (!label) return null;
  const today = istDate(now);
  for (let k = 0; k <= 15; k++) {
    const d = addIstDays(today, k);
    if (formatIstDay(istToUtc(d, "12:00")!) === label) return d;
  }
  return null;
}

/** If our last outbound message was a slot offer, recover its date and times. */
function lastOffer(history: MessageRow[], now: Date): { date: string; times: string[] } | null {
  const lastOut = [...history].reverse().find((m) => m.direction === "out");
  if (!lastOut || lastOut.sender !== "ai") return null;
  const m = OFFER_RE.exec(lastOut.body.trim());
  const date = m ? dateFromLabel(m[1], now) : null;
  return m && date ? { date, times: m[2].split(", ") } : null;
}

/** "11:00 AM" → "11:00", "1:30 PM" → "13:30" */
export function to24(label: string): string {
  const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
  if (!m) return label;
  let h = Number(m[1]) % 12;
  if (m[3] === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

export function pickSlot(t: string, times: string[]): string | null {
  const ordinals: [RegExp, number][] = [
    [/(pehl|pahl|first|1st|^1$)/, 0],
    [/(dusr|doosr|second|2nd|^2$)/, 1],
    [/(teesr|tisr|third|3rd|^3$)/, 2],
    [/(last|aakhri|akhri)/, times.length - 1],
  ];
  for (const [re, idx] of ordinals) if (re.test(t) && times[idx]) return times[idx];

  for (const m of t.matchAll(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|bje)?/g)) {
    const h = Number(m[1]);
    const min = m[2] ?? "00";
    const ampm = m[3] === "am" || m[3] === "pm" ? m[3].toUpperCase() : null;
    const hit = times.find((label) => {
      const p = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(label);
      return p && Number(p[1]) === h && p[2] === min && (!ampm || p[3] === ampm);
    });
    if (hit) return hit;
  }

  if (times.length === 1 && AFFIRM.test(t)) return times[0];
  return null;
}

// ─── Agent ─────────────────────────────────────────────────────────────────

export async function runMockAgent(input: MockInput): Promise<AgentResult> {
  const { config, lead, now, handlers } = input;
  const t = norm(input.text);
  const toolCalls: ToolCallLog[] = [];

  const call = async (name: string, args: Record<string, unknown> = {}): Promise<ToolOutcome> => {
    const out = await handlers[name](args);
    toolCalls.push({ name, input: args, result: out.result });
    return out;
  };
  const reply = (text: string): AgentResult => ({ reply: text.replace(/\s+/g, " ").trim(), terminal: null, toolCalls });
  const handoff = async (category: string, reason: string): Promise<AgentResult> => {
    const out = await call("handoff_to_human", { category, reason });
    return { reply: null, terminal: out.terminal ?? "handoff", toolCalls };
  };

  const questionFor = (key: string) => config.qualification_questions.find((q) => q.key === key)?.question ?? "";
  const visitPrompt = "Visit ke liye kaunsa din theek rahega? Aaj, kal ya weekend?";

  const offerSlots = async (date: string, prefix = ""): Promise<AgentResult> => {
    for (let k = 0; k < 4; k++) {
      const d = addIstDays(date, k);
      const out = await call("get_available_slots", { date: d });
      const r = out.result as { day?: string; slots?: { label: string }[] };
      if (!out.isError && r.slots?.length) {
        return reply(`${prefix} ${offerText(r.day!, r.slots.slice(0, 3).map((s) => s.label))}`);
      }
    }
    return handoff("other", "Agle kuch din me koi visit slot khali nahi");
  };

  const book = async (date: string, label: string): Promise<AgentResult> => {
    const out = await call("book_appointment", { starts_at: `${date} ${to24(label)}`, notes: `Lead ne ${label} chuna` });
    const r = out.result as { ok?: boolean; date?: string; time?: string; location?: string | null; alternatives?: string[] };
    if (r.ok) {
      const where = r.location ? ` Location: ${r.location}.` : "";
      return reply(`Aapka visit ${r.date}, ${r.time} ko book ho gaya hai.${where} Hamari team aapse wahan milegi.`);
    }
    const alts = (r.alternatives ?? []).map((v) => v.split(" ")[1]);
    if (alts.length) {
      const labels = alts.map((hhmm) => {
        const [h, m] = hhmm.split(":").map(Number);
        return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
      });
      return reply(`Maaf kijiye, ye slot abhi book ho gaya. ${offerText(formatIstDay(istToUtc(date, "12:00")!), labels)}`);
    }
    return offerSlots(addIstDays(date, 1), "Maaf kijiye, ye slot abhi book ho gaya.");
  };

  // 1. "Are you a bot?" → honest answer, offer a human (SYSTEM_DESIGN §3)
  if (BOT_QUESTION.test(t)) {
    return reply(`Haan. ${renderDisclosure(config)} Team se baat karni ho to bas bata dijiye.`);
  }

  // 2. Hard handoff triggers
  for (const [category, re, reason] of HANDOFF) {
    if (re.test(t)) return handoff(category, reason);
  }

  const q0 = lead.qualification ?? {};
  const isQuestion = QUESTION_WORD.test(t);
  let info = isQuestion ? faqAnswer(t, config) : null;
  if (!info && isQuestion && PRICE.test(t)) {
    if (!config.pricing_notes?.trim()) return handoff("out_of_scope", "Price poocha, config me pricing nahi hai");
    info = config.pricing_notes.trim();
  }
  const prefix = info ?? "";

  // 3. Already booked
  if (q0.visit_slot && !RESCHEDULE.test(t)) {
    const where = config.project_address ? ` Location: ${config.project_address}.` : "";
    return reply(`${prefix} Aapka visit ${q0.visit_slot} ko booked hai.${where} Aur kuch poochna ho to bataiye.`);
  }

  // 4. Answering our slot offer
  const offer = lastOffer(input.history, now);
  if (offer) {
    const pick = pickSlot(t, offer.times);
    if (pick) return book(offer.date, pick);
    const v = parseVisit(t, now, true);
    if (v) return offerSlots(v.date, prefix);
    return reply(`${prefix} Kaunsa time theek rahega? ${offer.times.join(", ")}`);
  }

  // 5. Qualification answers (one or several in one message)
  const score0 = scoreLead(q0, config.qualification_questions, config.budget_ranges, config.scoring_rules);
  const current = score0.missing[0];
  if (!current) {
    const v = parseVisit(t, now, true);
    if (v) return offerSlots(v.date, prefix);
  }
  const ext = extract(t, input.text, score0.missing, now);

  if (Object.keys(ext.answers).length) {
    const merged = { ...(q0.answers ?? {}), ...ext.answers };
    const out = await call("update_lead", {
      answers: ext.answers,
      ...(ext.budget_min_inr !== undefined ? { budget_min_inr: ext.budget_min_inr, budget_max_inr: ext.budget_max_inr } : {}),
      ...(ext.timeline_months !== undefined ? { timeline_months: ext.timeline_months } : {}),
      summary: Object.values(merged).join(", "),
    });
    const stillToAsk = (out.result as { still_to_ask?: string[] }).still_to_ask ?? [];
    if (stillToAsk.length) return reply(`${prefix || "Shukriya!"} ${questionFor(stillToAsk[0])}`);

    const visitDate = ext.visitDate ?? dateFromLabel(merged.visit_pref, now) ?? addIstDays(istDate(now), 1);
    return offerSlots(visitDate, prefix || "Shukriya!");
  }

  const nextPrompt = current ? questionFor(current) : visitPrompt;

  // 6. Info question or small talk → answer, then steer back
  if (info) return reply(`${info} ${nextPrompt}`);
  if (GREETING.test(t)) return reply(`Ji! ${nextPrompt}`);

  // 7. A question we have no facts for → team (never guess)
  if (isQuestion) return handoff("out_of_scope", `Sawal config me nahi: ${input.text.slice(0, 80)}`);

  // 8. Didn't understand
  const out = await call("mark_unclear");
  if (out.terminal) return { reply: null, terminal: out.terminal, toolCalls };
  return reply(`Maaf kijiye, ye samajh nahi aaya. ${nextPrompt}`);
}
