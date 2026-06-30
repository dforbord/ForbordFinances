import { useMemo } from "react";
import { useStore } from "../store";
import { fmt } from "../format";
import { BucketType } from "../types";
import { MonthSwitch } from "./MonthSwitch";

const TYPE_LABEL: Record<BucketType, string> = {
  expense: "Expenses",
  tax: "Taxes",
  savings: "Savings",
};

export function Dashboard({
  month,
  setMonth,
}: {
  month: string;
  setMonth: (m: string) => void;
}) {
  const { state } = useStore();
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

  const groups: BucketType[] = ["expense", "tax", "savings"];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="subtle">Where your money went this month</div>
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
          <div className="value">{fmt(totals.byType.expense)}</div>
        </div>
        <div className="card stat">
          <div className="label">Taxes</div>
          <div className="value amber">{fmt(totals.byType.tax)}</div>
        </div>
        <div className="card stat">
          <div className="label">Savings</div>
          <div className="value blue">{fmt(totals.byType.savings)}</div>
        </div>
        <div className="card stat">
          <div className="label">Left to Allocate</div>
          <div className={`value ${totals.leftover < 0 ? "red" : "green"}`}>
            {fmt(totals.leftover)}
          </div>
        </div>
      </div>

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
          return (
            <div className="section" key={type}>
              <h2>{TYPE_LABEL[type]}</h2>
              <div className="card">
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
                              <div
                                style={{
                                  width: `${Math.min(pct, 100)}%`,
                                  background: b.color,
                                }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
