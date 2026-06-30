import { AppState, Goal } from "./types";
import { clamp, parseDate } from "./format";

const DAYS_PER_MONTH = 30.4375;

export type GoalStatus = "reached" | "ahead" | "on-track" | "behind" | "overdue";

export interface GoalStats {
  saved: number;
  target: number;
  remaining: number;
  fractionSaved: number;
  /** 0..1 of target where an even, on-time plan says you should be now. */
  expectedFractionOfTarget: number;
  expectedByNow: number;
  delta: number;
  status: GoalStatus;
  daysLeft: number;
  monthsLeft: number;
  /** The headline: average $/month you must save from now to finish on time. */
  requiredMonthly: number;
  /** The even rate the goal started with (target − startAmount over the full span). */
  baselineMonthly: number;
  /** How much more per month than the original plan you now need (catch-up premium). */
  extraPerMonth: number;
  aheadAmount: number;
  behindAmount: number;
}

export function goalSaved(goal: Goal): number {
  return goal.startAmount + (goal.contributions ?? []).reduce((s, c) => s + c.amount, 0);
}

export function computeGoal(_state: AppState, goal: Goal, now: Date = new Date()): GoalStats {
  const saved = goalSaved(goal);
  const target = goal.targetAmount;
  const remaining = Math.max(0, target - saved);

  // Use continuous millisecond precision so the plan line advances smoothly
  // instead of jumping a whole day's worth the moment the date ticks over.
  const start = parseDate(goal.startDate).getTime();
  const end = parseDate(goal.targetDate).getTime();
  const nowMs = now.getTime();
  const totalMs = Math.max(1, end - start);
  const elapsedMs = clamp(nowMs - start, 0, totalMs);
  const daysLeft = Math.max(0, (end - nowMs) / 86_400_000);
  const monthsLeft = daysLeft / DAYS_PER_MONTH;
  const totalMonths = totalMs / 86_400_000 / DAYS_PER_MONTH;

  // Even, on-time plan line — used only to say how far ahead/behind you are.
  const frac = elapsedMs / totalMs;
  const expectedByNow = goal.startAmount + (target - goal.startAmount) * frac;
  const delta = saved - expectedByNow;
  const tol = Math.max(50, target * 0.02);

  const reached = saved >= target;
  const overdue = !reached && nowMs >= end;
  let status: GoalStatus;
  if (reached) status = "reached";
  else if (overdue) status = "overdue";
  else if (delta > tol) status = "ahead";
  else if (delta < -tol) status = "behind";
  else status = "on-track";

  // The average rate you need from here — rises if behind, falls if ahead.
  const requiredMonthly = monthsLeft > 0 ? remaining / monthsLeft : remaining;
  const baselineMonthly =
    totalMonths > 0 ? Math.max(0, target - goal.startAmount) / totalMonths : remaining;
  const extraPerMonth = Math.max(0, requiredMonthly - baselineMonthly);

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
    baselineMonthly,
    extraPerMonth,
    aheadAmount: Math.max(0, delta),
    behindAmount: Math.max(0, -delta),
  };
}
