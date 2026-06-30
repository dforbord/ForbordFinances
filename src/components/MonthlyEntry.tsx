import { useState } from "react";
import { useStore, uid } from "../store";
import { monthKey } from "../storage";
import { fmt, todayKey } from "../format";
import { MonthSwitch } from "./MonthSwitch";

// Stamp entries with a real date: today if logging the current month, else the
// 1st of the month being edited. Powers the weekly charts.
function entryDate(month: string): string {
  return month === monthKey(new Date()) ? todayKey() : `${month}-01`;
}

export function MonthlyEntry({
  month,
  setMonth,
  embedded,
}: {
  month: string;
  setMonth: (m: string) => void;
  embedded?: boolean;
}) {
  const { state, dispatch } = useStore();
  const data = state.months[month] ?? { income: [], txns: [] };

  // Income form
  const [incLabel, setIncLabel] = useState("");
  const [incAmt, setIncAmt] = useState("");

  // Txn form
  const firstBucket = state.buckets[0]?.id ?? "";
  const [txnBucket, setTxnBucket] = useState(firstBucket);
  const [txnLabel, setTxnLabel] = useState("");
  const [txnAmt, setTxnAmt] = useState("");
  const [txnAccount, setTxnAccount] = useState("");

  const selectedBucket = state.buckets.find((b) => b.id === txnBucket);
  const isSavings = selectedBucket?.type === "savings";

  function addIncome() {
    const amount = parseFloat(incAmt);
    if (!incLabel.trim() || isNaN(amount)) return;
    dispatch({
      type: "ADD_INCOME",
      month,
      entry: { id: uid(), label: incLabel.trim(), amount, date: entryDate(month) },
    });
    setIncLabel("");
    setIncAmt("");
  }

  function addTxn() {
    const amount = parseFloat(txnAmt);
    if (!txnBucket || isNaN(amount)) return;
    dispatch({
      type: "ADD_TXN",
      month,
      txn: {
        id: uid(),
        bucketId: txnBucket,
        label: txnLabel.trim() || (selectedBucket?.name ?? ""),
        amount,
        accountId: isSavings && txnAccount ? txnAccount : undefined,
        date: entryDate(month),
      },
    });
    setTxnLabel("");
    setTxnAmt("");
  }

  const incomeTotal = data.income.reduce((s, i) => s + i.amount, 0);
  const txnTotal = data.txns.reduce((s, t) => s + t.amount, 0);

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Monthly Entry</h1>
            <div className="subtle">Log income and spending for this month</div>
          </div>
          <MonthSwitch month={month} setMonth={setMonth} />
        </div>
      )}

      {/* INCOME */}
      <div className="section">
        <h2>Income</h2>
        <div className="card">
          <div className="row-form">
            <div className="field grow">
              <label>Source</label>
              <input
                placeholder="e.g. Paycheck, Side gig"
                value={incLabel}
                onChange={(e) => setIncLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIncome()}
              />
            </div>
            <div className="field amt">
              <label>Amount</label>
              <input
                type="number"
                placeholder="0.00"
                value={incAmt}
                onChange={(e) => setIncAmt(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addIncome()}
              />
            </div>
            <button className="primary" onClick={addIncome}>
              Add Income
            </button>
          </div>

          {data.income.length === 0 ? (
            <div className="empty">No income logged for this month yet.</div>
          ) : (
            <table className="table">
              <tbody>
                {data.income.map((i) => (
                  <tr key={i.id}>
                    <td>{i.label}</td>
                    <td className="num">{fmt(i.amount)}</td>
                    <td className="actions">
                      <button
                        className="danger small"
                        onClick={() => dispatch({ type: "DELETE_INCOME", month, id: i.id })}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                <tr className="total-row">
                  <td>Total income</td>
                  <td className="num">{fmt(incomeTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* SPENDING */}
      <div className="section">
        <h2>Expenses, Taxes &amp; Savings</h2>
        <div className="card">
          {state.buckets.length === 0 ? (
            <div className="empty">
              Create some buckets first (Buckets tab) so you have categories to assign.
            </div>
          ) : (
            <>
              <div className="row-form">
                <div className="field type">
                  <label>Bucket</label>
                  <select
                    value={txnBucket}
                    onChange={(e) => setTxnBucket(e.target.value)}
                  >
                    {state.buckets.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.type})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field grow">
                  <label>Description (optional)</label>
                  <input
                    placeholder="e.g. Rent, Costco, Roth IRA"
                    value={txnLabel}
                    onChange={(e) => setTxnLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTxn()}
                  />
                </div>
                {isSavings && state.accounts.length > 0 && (
                  <div className="field type">
                    <label>Into account</label>
                    <select value={txnAccount} onChange={(e) => setTxnAccount(e.target.value)}>
                      <option value="">— none —</option>
                      {state.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="field amt">
                  <label>Amount</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={txnAmt}
                    onChange={(e) => setTxnAmt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTxn()}
                  />
                </div>
                <button className="primary" onClick={addTxn}>
                  Add
                </button>
              </div>

              {data.txns.length === 0 ? (
                <div className="empty">Nothing logged yet this month.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Bucket</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.txns.map((t) => {
                      const b = state.buckets.find((x) => x.id === t.bucketId);
                      return (
                        <tr key={t.id}>
                          <td>
                            <span
                              className="dot"
                              style={{ background: b?.color ?? "#888" }}
                            />
                            {b?.name ?? "Unknown"}
                          </td>
                          <td>{t.label}</td>
                          <td className="num">{fmt(t.amount)}</td>
                          <td className="actions">
                            <button
                              className="danger small"
                              onClick={() => dispatch({ type: "DELETE_TXN", month, id: t.id })}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="total-row">
                      <td>Total out</td>
                      <td />
                      <td className="num">{fmt(txnTotal)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
