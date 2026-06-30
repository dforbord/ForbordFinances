import { AppState, Goal } from "./types";
import { clamp, daysBetween, parseDate, shiftMonth } from "./format";
import { monthKey } from "./storage";

const DAYS_PER_MONTH = 30.4375;

function savingsBucketIds(state: AppState): Set<string> {
  return new Set(state.buckets.filter((b) => b.type === "savings").map((b) => b.id));
}

/** Total savings contributions logged to each account, across all months. */
export function accountContributions(state: AppState, accountId: string): number {
  const ids = savingsBucketIds(state);
  let sum = 0;
  for (const m of Object.values(state.months)) {
    for (const t of m.txns) {
      if (t.accountId === accountId && ids.has(t.bucketId)) sum += t.amount;
    }
  }
  return sum;
}

export function accountBalance(state: AppState, accountId: string): number {
  const acc = state.accounts.find((a) => a.id === accountId);
  if (!acc) return 0;
  return acc.startingBalance + accountContributions(state, accountId);
}

/** Average monthly contribution to an account over the last `months` calendar months. */
export function recentRunRate(
  state: AppState,
  accountId: string,
  now: Date,
  months = 3,
): number {
  const ids = savingsBucketIds(state);
  const wanted = new Set<string>();
  const base = monthKey(now);
  for (let i = 0; i < months; i++) wanted.add(shiftMonth(base, -i));

  let sum = 0;
  for (const [key, m] of Object.entries(state.months)) {
    if (!wanted.has(key)) continue;
    for (const t of m.txns) {
      if (t.accountId === accountId && ids.has(t.bucketId)) sum += t.amount;
    }
  }
  return sum / months;
}

export type GoalStatus = "reached" | "ahead" | "on-track" | "behind" | "overdue";

export interface GoalStats {
  saved: number;
  target: number;
  remaining: number;
  fractionSaved: number;
  /** 0..1 of the target where the straight-line plan says you should be now. */
  expectedFractionOfTarget: number;
  expectedByNow: number;
  delta: number;
  status: GoalStatus;
  daysLeft: number;
  monthsLeft: number;
  requiredMonthly: number;
  runRate: number;
  projectedFinal: number;
  projectedDelta: number;
  catchUpNextMonth: number;
  aheadAmount: number;
  behindAmount: number;
}

export function computeGoal(state: AppState, goal: Goal, now: Date = new Date()): GoalStats {
  const saved = goal.accountId ? accountBalance(state, goal.accountId) : goal.startAmount;
  const target = goal.targetAmount;
  const remaining = Math.max(0, target - saved);

  const start = parseDate(goal.startDate);
  const end = parseDate(goal.targetDate);
  const totalDays = Math.max(1, daysBetween(start, end));
  const elapsedDays = clamp(daysBetween(start, now), 0, totalDays);
  const daysLeft = Math.max(0, daysBetween(now, end));
  const monthsLeft = daysLeft / DAYS_PER_MONTH;

  const frac = elapsedDays / totalDays;
  const expectedByNow = goal.startAmount + (target - goal.startAmount) * frac;
  const delta = saved - expectedByNow;
  const tol = Math.max(50, target * 0.02);

  const reached = saved >= target;
  const overdue = !reached && now >= end;
  let status: GoalStatus;
  if (reached) status = "reached";
  else if (overdue) status = "overdue";
  else if (delta > tol) status = "ahead";
  else if (delta < -tol) status = "behind";
  else status = "on-track";

  const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  const runRate = goal.accountId ? recentRunRate(state, goal.accountId, now) : 0;
  const projectedFinal = saved + runRate * monthsLeft;
  const projectedDelta = projectedFinal - target;

  const fracNext = clamp((elapsedDays + DAYS_PER_MONTH) / totalDays, 0, 1);
  const expectedNext = goal.startAmount + (target - goal.startAmount) * fracNext;
  const catchUpNextMonth = Math.max(0, expectedNext - saved);

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
    requiredMonthly,
    runRate,
    projectedFinal,
    projectedDelta,
    catchUpNextMonth,
    aheadAmount: Math.max(0, delta),
    behindAmount: Math.max(0, -delta),
  };
}
