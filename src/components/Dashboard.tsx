import { useMemo, useState } from "react";
import { useStore } from "../store";
import { fmt, monthLabel } from "../format";
import { BucketType } from "../types";
import { computeGoal, monthlySeries, GoalStatus } from "../selectors";
import { MonthSwitch } from "./MonthSwitch";
import { MonthlyChart } from "./MonthlyChart";

const TYPE_LABEL: Record<BucketType, string> = {
  expense: "Expenses",
  tax: "Taxes",
  savings: "Savings",
};

const GREEN = "#10b981";
const ORANGE = "#f97316";
const BLUE = "#3b82f6";

// Known household accounts → preferred first name.
const NAME_BY_EMAIL: Record<string, string> = {
  "dkforbord@gmail.com": "Dylan",
  "isabellasmith011@gmail.com": "Isabella",
};

function greetingName(user: { email: string | null; name: string | null } | null): string {
  if (!user) return "Dylan";
  if (user.email && NAME_BY_EMAIL[user.email]) return NAME_BY_EMAIL[user.email];
  if (user.name) return user.name.split(/\s+/)[0];
  if (user.email) return user.email.split("@")[0];
  return "there";
}

const STATUS_COLOR: Record<GoalStatus, string> = {
  reached: "#10b981",
  ahead: "#10b981",
  "on-track": "#3b82f6",
  behind: "#ef4444",
  overdue: "#ef4444",
};
const STATUS_LABEL: Record<GoalStatus, string> = {
  reached: "Reached",
  ahead: "Ahead",
  "on-track": "On pace",
  behind: "Behind",
  overdue: "Past due",
};

export function Dashboard({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (m: string) => void;
}) {
  const { state, cloud } = useStore();
  const data = state.months[month] ?? { income: [], txns: [] };

  const totals = useMemo(() => {
    const income = data.income.reduce((s, i) => s + i.amount, 0);
    const byBucket = new Map<string, number>();
    for (const t of data.txns) {
      byBucket.set(t.bucketId, (byBucket.get(t.bucketId) ?? 0) + t.amount);
    }
    const byType: Record<BucketType, number> = { expense: 0, tax: 0, savings: 0 };
    for (const b of state.buckets) {
      byType[b.type] += byBucket.get(b.id) ?? 0;
    }
    const spent = byType.expense + byType.tax + byType.savings;
    return { income, byBucket, byType, leftover: income - spent };
  }, [data, state.buckets]);

  // Last 5 calendar months (the 4 completed + the current running one).
  const months = useMemo(() => monthlySeries(state, 5), [state]);
  const toPoints = (pick: (m: (typeof months)[number]) => number) =>
    months.map((m) => ({
      label: m.label,
      fullLabel: m.fullLabel,
      value: pick(m),
      isCurrent: m.isCurrent,
    }));
  // Income chart shows two lines: gross (dashed) and net = gross − taxes (solid, prominent).
  // "Taxes" is whatever's logged into tax-type buckets (the 1099 Income Tax bucket).
  const netIncomePoints = toPoints((m) => m.income - m.taxes);
  const grossIncomeValues = months.map((m) => m.income);
  const spendPoints = toPoints((m) => m.spending);
  const savingsPoints = toPoints((m) => m.savings);

  const groups: BucketType[] = ["expense", "tax", "savings"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hello {greetingName(cloud.user)}</h1>
          <div className="subtle">Here is your financial dashboard for {monthLabel(month)}</div>
        </div>
        <MonthSwitch month={month} setMonth={setMonth} />
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Income</div>
          <div className="value green">{fmt(totals.income)}</div>
        </div>
        <div className="card stat">
          <div className="label">Expenses</div>
          <div className="value orange">{fmt(totals.byType.expense)}</div>
        </div>
        <div className="card stat">
          <div className="label">Taxes</div>
          <div className="value orange">{fmt(totals.byType.tax)}</div>
        </div>
        <div className="card stat">
          <div className="label">Savings</div>
          <div className="value green">{fmt(totals.byType.savings)}</div>
        </div>
        <div className="card stat">
          <div className="label">Left to Allocate</div>
          <div className={`value ${totals.leftover < 0 ? "red" : "green"}`}>
            {fmt(totals.leftover)}
          </div>
        </div>
      </div>

      {/* Monthly trend charts — the current month is a live running total; past months settle. */}
      <div className="section">
        <h2>Monthly trends <span className="subtle" style={{ fontWeight: 400 }}>· last 5 months</span></h2>
        <div className="chart-row chart-row-3">
          <MonthlyChart
            title="Income / month"
            color={GREEN}
            points={netIncomePoints}
            compare={grossIncomeValues}
            primaryLabel="Net"
            compareLabel="Gross"
          />
          <MonthlyChart title="Spending / month" color={ORANGE} points={spendPoints} />
          <MonthlyChart title="Savings / month" color={BLUE} points={savingsPoints} />
        </div>
      </div>

      {/* Quick goals widget */}
      {state.goals.length > 0 && (
        <div className="section">
          <h2>Goals</h2>
          <div className="goal-widget-grid">
            {state.goals.map((g) => {
              const s = computeGoal(state, g);
              return (
                <div key={g.id} className="card goal-widget" style={{ borderLeft: `3px solid ${g.color}` }}>
                  <div className="goal-widget-head">
                    <span className="goal-widget-name">{g.name}</span>
                    <span
                      className="tag"
                      style={{ background: STATUS_COLOR[s.status] + "22", color: STATUS_COLOR[s.status] }}
                    >
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="goalbar" style={{ height: 10 }}>
                    <div
                      className="goalbar-fill"
                      style={{ width: `${s.fractionSaved * 100}%`, background: g.color }}
                    />
                    {s.status !== "reached" && (
                      <div className="goalbar-marker" style={{ left: `${s.markerFraction * 100}%` }} />
                    )}
                  </div>
                  <div className="goal-widget-foot subtle">
                    <span>{fmt(s.saved)} / {fmt(s.target)}</span>
                    <span>Save {fmt(s.saveThisMonth)} this mo</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {state.buckets.length === 0 ? (
        <div className="section">
          <div className="empty">
            No buckets yet. Go to <strong>Buckets</strong> to create expense, tax, and savings
            categories.
          </div>
        </div>
      ) : (
        groups.map((type) => {
          const buckets = state.buckets.filter((b) => b.type === type);
          if (buckets.length === 0) return null;
          const total = buckets.reduce((s, b) => s + (totals.byBucket.get(b.id) ?? 0), 0);
          return (
            <CollapsibleGroup
              key={type}
              title={TYPE_LABEL[type]}
              total={total}
              color={type === "expense" || type === "tax" ? ORANGE : GREEN}
            >
              <table className="table">
                <thead>
                  <tr>
                    <th>Bucket</th>
                    <th className="num">Planned</th>
                    <th className="num">Actual</th>
                    <th style={{ width: "32%" }}>Progress</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => {
                    const actual = totals.byBucket.get(b.id) ?? 0;
                    const pct = b.planned > 0 ? (actual / b.planned) * 100 : actual > 0 ? 100 : 0;
                    const over = b.planned > 0 && actual > b.planned;
                    return (
                      <tr key={b.id}>
                        <td>
                          <span className="dot" style={{ background: b.color }} />
                          {b.name}
                        </td>
                        <td className="num">{fmt(b.planned)}</td>
                        <td className="num">{fmt(actual)}</td>
                        <td>
                          <div className={`bar ${over ? "over" : ""}`}>
                            <div style={{ width: `${Math.min(pct, 100)}%`, background: b.color }} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CollapsibleGroup>
          );
        })
      )}
    </>
  );
}

function CollapsibleGroup({
  title,
  total,
  color,
  children,
}: {
  title: string;
  total: number;
  color: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="section">
      <button className="collapse-head" onClick={() => setOpen((o) => !o)}>
        <span className={`chevron ${open ? "open" : ""}`}>›</span>
        <span className="collapse-title">{title}</span>
        <span className="collapse-total" style={{ color }}>{fmt(total)}</span>
      </button>
      {open && <div className="card" style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}
