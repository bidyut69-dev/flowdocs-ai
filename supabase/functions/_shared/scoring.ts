// Lead score, priority and status.
//
// Score: points per answer from org_config.scoring_rules (DEFAULT_SCORING_RULES when the org has none),
// recalculated after every qualification answer and after a booking. Max 100 with the defaults.
// Priority: hot / warm / cold from the score, unless the owner locked it (leads.priority_locked).
// Status: qualified = timeline within N months + budget inside a configured range + visit time given
// (SYSTEM_DESIGN §4.1). Each criterion only applies when the org actually asks that question.

import type { BudgetRange, Lead, LeadPriority, LeadStatus, Qualification, QualificationQuestion } from "./types.ts";

export const SCORING = {
  qualifiedTimelineMonths: 3,
};

export interface ScoringRules {
  points: {
    budget_in_range: number; // budget answer overlaps a budget range (any budget answer if the org has no ranges)
    answered: Record<string, number>; // other question keys, points just for answering (e.g. bhk)
    timeline: { max_months: number; points: number }[]; // first bracket the timeline fits; none = 0 (browsing)
    visit_pref: number; // gave a day/time for the visit
    visit_booked: number; // visit actually booked
  };
  priority: { hot: number; warm: number }; // minimum score for each; below warm = cold
}

/** What org_config.scoring_rules may hold: any part of the rules; missing keys use the defaults. */
export interface ScoringRulesConfig {
  points?: Partial<ScoringRules["points"]>;
  priority?: Partial<ScoringRules["priority"]>;
}

// Same values as the org_config.scoring_rules column default (migration 20261009000004).
export const DEFAULT_SCORING_RULES: ScoringRules = {
  points: {
    budget_in_range: 25,
    answered: { bhk: 10 },
    timeline: [{ max_months: 3, points: 25 }, { max_months: 6, points: 15 }],
    visit_pref: 15,
    visit_booked: 25,
  },
  priority: { hot: 70, warm: 40 },
};

/** Org rules over the defaults, so a partial or malformed config never breaks scoring. */
export function scoringRules(rules: ScoringRulesConfig | null | undefined): ScoringRules {
  const d = DEFAULT_SCORING_RULES;
  const p: Partial<ScoringRules["points"]> = rules?.points ?? {};
  const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  return {
    points: {
      budget_in_range: num(p.budget_in_range, d.points.budget_in_range),
      answered: p.answered && typeof p.answered === "object" ? p.answered : d.points.answered,
      timeline: Array.isArray(p.timeline) ? p.timeline : d.points.timeline,
      visit_pref: num(p.visit_pref, d.points.visit_pref),
      visit_booked: num(p.visit_booked, d.points.visit_booked),
    },
    priority: {
      hot: num(rules?.priority?.hot, d.priority.hot),
      warm: num(rules?.priority?.warm, d.priority.warm),
    },
  };
}

// Statuses the scorer never moves a lead out of.
const STICKY: LeadStatus[] = ["booked", "won", "lost", "opted_out", "invalid_phone"];

export interface ScoreResult {
  score: number;
  qualified: boolean;
  missing: string[]; // question keys not yet answered
}

function answered(q: Qualification, key: string): boolean {
  const v = q.answers?.[key];
  return typeof v === "string" && v.trim().length > 0;
}

export function budgetInRange(q: Qualification, ranges: BudgetRange[]): boolean {
  const min = q.budget_min_inr ?? q.budget_max_inr;
  const max = q.budget_max_inr ?? q.budget_min_inr;
  if (min == null || max == null) return false;
  return ranges.some((r) => min <= r.max && r.min <= max);
}

export function scoreLead(
  q: Qualification,
  questions: QualificationQuestion[],
  ranges: BudgetRange[],
  rulesIn?: ScoringRulesConfig | null,
): ScoreResult {
  const rules = scoringRules(rulesIn);
  const keys = questions.map((x) => x.key);
  const missing = keys.filter((k) => !answered(q, k));

  const asksBudget = keys.includes("budget");
  const asksTimeline = keys.includes("timeline");
  const asksVisit = keys.includes("visit_pref");

  const budgetOk = !asksBudget || (answered(q, "budget") && (ranges.length === 0 || budgetInRange(q, ranges)));
  const timelineOk = !asksTimeline ||
    (q.timeline_months != null && q.timeline_months <= SCORING.qualifiedTimelineMonths);
  const visitOk = !asksVisit || answered(q, "visit_pref");

  let score = 0;
  if (asksBudget && answered(q, "budget") && budgetOk) score += rules.points.budget_in_range;
  for (const [key, pts] of Object.entries(rules.points.answered)) {
    if (keys.includes(key) && answered(q, key) && typeof pts === "number") score += pts;
  }
  if (asksTimeline && q.timeline_months != null) {
    const bracket = rules.points.timeline.find((b) => q.timeline_months! <= b.max_months);
    score += bracket?.points ?? 0;
  }
  if (asksVisit && visitOk) score += rules.points.visit_pref;
  if (q.visit_slot) score += rules.points.visit_booked;

  const anyCriterion = asksBudget || asksTimeline || asksVisit;
  const qualified = anyCriterion && budgetOk && timelineOk && visitOk;

  return { score: Math.max(0, Math.min(100, Math.round(score))), qualified, missing };
}

export function priorityFor(score: number, rulesIn?: ScoringRulesConfig | null): LeadPriority {
  const { hot, warm } = scoringRules(rulesIn).priority;
  return score >= hot ? "hot" : score >= warm ? "warm" : "cold";
}

/** Score + priority for a lead after its qualification changed. A locked priority stays as the owner set it. */
export function rescoreLead(
  lead: Pick<Lead, "priority" | "priority_locked">,
  q: Qualification,
  config: { qualification_questions: QualificationQuestion[]; budget_ranges: BudgetRange[]; scoring_rules?: ScoringRulesConfig | null },
): ScoreResult & { priority: LeadPriority } {
  const r = scoreLead(q, config.qualification_questions, config.budget_ranges, config.scoring_rules);
  return { ...r, priority: lead.priority_locked ? lead.priority : priorityFor(r.score, config.scoring_rules) };
}

export function nextStatus(current: LeadStatus, qualified: boolean): LeadStatus {
  if (STICKY.includes(current)) return current;
  return qualified ? "qualified" : "contacted";
}
