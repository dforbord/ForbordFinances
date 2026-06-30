import { AppState, Goal } from "./types";
import { clamp, daysBetween, parseDate } from "./format";

const DAYS_PER_MONTH = 30.4375;

export type GoalStatus = "reached" | "ahead" | "on-track" | "behind" | "overdue";

export interface GoalStats {
  saved: number;
  target: number;
  remaining: number;
  fractionSaved: number;
  /** 0..1 of target where the straight-line plan says you should be now. */
  expectedFractionOfTarget: number;
  expectedByNow: number;
  delta: number;
  status: GoalStatus;
  daysLeft: number;
  monthsLeft: number;
  monthsElapsed: number;
  /** How much you must save per month from now to finish on time. */
  requiredMonthly: number;
  /** Your effective recent savings pace ($/month). */
  pace: number;
  projectedFinal: number;
  projectedDelta: number;
  /** Months from now to hit target at your current pace (Infinity if pace is 0). */
  finishEtaMonths: number;
  catchUpNextMonth: number;
  aheadAmount: number;
  behindAmount: number;
  /** 0..1 — how much the status leans on trajectory vs. current position. */
  trajectoryWeight: number;
}

export function goalSaved(goal: Goal): number {
  return goal.startAmount + (goal.contributions ?? []).reduce((s, c) => s + c.amount, 0);
}

export function computeGoal(_state: AppState, goal: Goal, now: Date = new Date()): GoalStats {
  const saved = goalSaved(goal);
  const target = goal.targetAmount;
  const remaining = Math.max(0, target - saved);

  const start = parseDate(goal.startDate);
  const end = parseDate(goal.targetDate);
  const totalDays = Math.max(1, daysBetween(start, end));
  const elapsedDays = clamp(daysBetween(start, now), 0, totalDays);
  const daysLeft = Math.max(0, daysBetween(now, end));
  const monthsLeft = daysLeft / DAYS_PER_MONTH;
  const monthsElapsed = Math.max(0, daysBetween(start, now) / DAYS_PER_MONTH);

  const frac = elapsedDays / totalDays;
  const expectedByNow = goal.startAmount + (target - goal.startAmount) * frac;
  const delta = saved - expectedByNow;

  // --- Pace (from manual contributions) ---
  const contribs = goal.contributions ?? [];
  const startKey = goal.startDate;
  const sinceStart = contribs
    .filter((c) => c.date >= startKey)
    .reduce((s, c) => s + c.amount, 0);
  const recentCutoff = new Date(now.getTime() - 60 * 86_400_000);
  const recentContrib = contribs
    .filter((c) => parseDate(c.date) >= recentCutoff)
    .reduce((s, c) => s + c.amount, 0);

  const overallPace = sinceStart / Math.max(monthsElapsed, 0.5);
  const recentPace = recentContrib / 2;
  const pace = monthsElapsed < 1 ? overallPace : 0.6 * recentPace + 0.4 * overallPace;

  const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  const projectedFinal = saved + pace * monthsLeft;
  const projectedDelta = projectedFinal - target;
  const finishEtaMonths = pace > 0 ? remaining / pace : Infinity;

  const fracNext = clamp((elapsedDays + DAYS_PER_MONTH) / totalDays, 0, 1);
  const expectedNext = goal.startAmount + (target - goal.startAmount) * fracNext;
  const catchUpNextMonth = Math.max(0, expectedNext - saved);

  // --- Status: starts as "are we on pace right now" (position), and shifts
  //     toward "will our trajectory get us there" (projection) as time passes. ---
  const reached = saved >= target;
  const overdue = !reached && now >= end;

  const posRatio = expectedByNow > 0 ? saved / expectedByNow : saved >= target ? 2 : 1;
  const paceRatio = target > 0 ? projectedFinal / target : 1;
  const trajectoryWeight = clamp(monthsElapsed / 3, 0, 1);
  const score = (1 - trajectoryWeight) * posRatio + trajectoryWeight * paceRatio;

  let status: GoalStatus;
  if (reached) status = "reached";
  else if (overdue) status = "overdue";
  else if (monthsElapsed < 0.2 && sinceStart === 0) status = "on-track"; // just started
  else if (score >= 1.05) status = "ahead";
  else if (score >= 0.97) status = "on-track";
  else status = "behind";

  return {
    saved,
    target,
    remaining,
    fractionSaved: target > 0 ? clamp(saved / target, 0, 1) : 0,
    expectedFractionOfTarget: target > 0 ? clamp(expectedByNow / target, 0, 1) : 0,
    expectedByNow,
    delta,
    status,
    daysLeft,
    monthsLeft,
    monthsElapsed,
    requiredMonthly,
    pace,
    projectedFinal,
    projectedDelta,
    finishEtaMonths,
    catchUpNextMonth,
    aheadAmount: Math.max(0, delta),
    behindAmount: Math.max(0, -delta),
    trajectoryWeight,
  };
}
