// Lead score + status. Simple and tunable here (SYSTEM_DESIGN §4.1):
// qualified = timeline within N months + budget inside a configured range + visit time given.
// Each criterion only applies when the org actually asks that question.

import type { BudgetRange, LeadStatus, Qualification, QualificationQuestion } from "./types.ts";

export const SCORING = {
  qualifiedTimelineMonths: 3,
  answeredWeight: 40, // spread across all configured questions
  budgetWeight: 20,
  timelineWeight: 20,
  visitWeight: 20,
};

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
): ScoreResult {
  const keys = questions.map((x) => x.key);
  const missing = keys.filter((k) => !answered(q, k));

  const asksBudget = keys.includes("budget");
  const asksTimeline = keys.includes("timeline");
  const asksVisit = keys.includes("visit_pref");

  const budgetOk = !asksBudget || (answered(q, "budget") && (ranges.length === 0 || budgetInRange(q, ranges)));
  const timelineOk = !asksTimeline ||
    (q.timeline_months != null && q.timeline_months <= SCORING.qualifiedTimelineMonths);
  const visitOk = !asksVisit || answered(q, "visit_pref");

  let score = keys.length === 0 ? 0 : Math.round(SCORING.answeredWeight * (keys.length - missing.length) / keys.length);
  if (asksBudget && budgetOk) score += SCORING.budgetWeight;
  if (asksTimeline && timelineOk) score += SCORING.timelineWeight;
  if (asksVisit && visitOk) score += SCORING.visitWeight;

  const anyCriterion = asksBudget || asksTimeline || asksVisit;
  const qualified = anyCriterion && budgetOk && timelineOk && visitOk;

  return { score: Math.min(100, score), qualified, missing };
}

export function nextStatus(current: LeadStatus, qualified: boolean): LeadStatus {
  if (STICKY.includes(current)) return current;
  return qualified ? "qualified" : "contacted";
}
