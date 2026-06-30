import { AppState, Goal } from "./types";
import { clamp, parseDate } from "./format";

export type GoalStatus = "reached" | "ahead" | "on-track" | "behind" | "overdue";

export interface GoalStats {
  saved: number;
  target: number;
  remaining: number;
  /** saved / target — the only thing that animates on the bar. */
  fractionSaved: number;
  /** Where the end-of-this-month checkpoint sits on the bar (0..1 of target). */
  markerFraction: number;
  /** Fixed monthly goal: (target − startAmount) ÷ months in plan. Never changes. */
  standardMonthly: number;
  /** Cumulative $ you should have by the END of the current month (the marker). */
  monthlyTarget: number;
  /** What to save THIS month to hit the marker = standard + carried-in shortfall. */
  saveThisMonth: number;
  /** saved − where you should be at the START of this month. +ahead / −behind. */
  delta: number;
  aheadAmount: number;
  behindAmount: number;
  status: GoalStatus;
  /** Whole months remaining (including the current one). */
  monthsLeft: number;
}

export function goalSaved(goal: Goal): number {
  return goal.startAmount + (goal.contributions ?? []).reduce((s, c) => s + c.amount, 0);
}

/** Whole calendar-month steps between two dates (boundaries crossed). */
function monthsDiff(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function computeGoal(_state: AppState, goal: Goal, now: Date = new Date()): GoalStats {
  const saved = goalSaved(goal);
  const target = goal.targetAmount;
  const remaining = Math.max(0, target - saved);

  const start = parseDate(goal.startDate);
  const end = parseDate(goal.targetDate);

  const totalMonths = Math.max(1, monthsDiff(start, end));
  const standardMonthly = Math.max(0, target - goal.startAmount) / totalMonths;

  // Whole months elapsed since the start (stepwise — no daily drift).
  const monthsElapsed = clamp(monthsDiff(start, now), 0, totalMonths);
  const monthsThroughThisMonth = Math.min(monthsElapsed + 1, totalMonths);

  // The end-of-current-month checkpoint (the bar marker), plan-only.
  const monthlyTarget = goal.startAmount + monthsThroughThisMonth * standardMonthly;
  const saveThisMonth = Math.max(0, monthlyTarget - saved); // standard + carried shortfall

  // Ahead/behind reflects only money from COMPLETED months — saving you do
  // during the current month counts toward "save this month", not toward being
  // ahead. So we compare contributions made before this month against the plan.
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const priorContrib = (goal.contributions ?? [])
    .filter((c) => parseDate(c.date) < firstOfThisMonth)
    .reduce((s, c) => s + c.amount, 0);
  const delta = priorContrib - monthsElapsed * standardMonthly; // + ahead / − behind
  const tol = Math.max(50, target * 0.02);

  const reached = saved >= target;
  const overdue = !reached && now >= end;
  let status: GoalStatus;
  if (reached) status = "reached";
  else if (overdue) status = "overdue";
  else if (delta > tol) status = "ahead";
  else if (delta < -tol) status = "behind";
  else status = "on-track";

  return {
    saved,
    target,
    remaining,
    fractionSaved: target > 0 ? clamp(saved / target, 0, 1) : 0,
    markerFraction: target > 0 ? clamp(monthlyTarget / target, 0, 1) : 0,
    standardMonthly,
    monthlyTarget,
    saveThisMonth,
    delta,
    aheadAmount: Math.max(0, delta),
    behindAmount: Math.max(0, -delta),
    status,
    monthsLeft: Math.max(0, totalMonths - monthsElapsed),
  };
}
