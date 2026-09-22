import { useEffect, useState } from "react";
import { deriveKeyword } from "../import";
import { useStore, uid } from "../store";
import { monthKey } from "../storage";
import { fmt, parseDate, todayKey } from "../format";
import { MonthSwitch } from "./MonthSwitch";
import { Bucket, BucketType, IncomeEntry, Txn } from "../types";

// Order + friendly labels for grouping the bucket dropdown by type.
const BUCKET_GROUPS: { type: BucketType; label: string }[] = [
  { type: "expense", label: "Expenses" },
  { type: "tax", label: "Taxes" },
  { type: "savings", label: "Savings" },
];

// Stamp entries with a real date: today if logging the current month, else the
// 1st of the month being edited. Powers the weekly charts.
function entryDate(month: string): string {
  return month === monthKey(new Date()) ? todayKey() : `${month}-01`;
}

// "Jul 3" for a YYYY-MM-DD key — the compact date shown in the log tables.
function fmtDay(key?: string): string {
  if (!key) return "—";
  return parseDate(key).toLocaleDateString("en-US", { month: "short", day: "numeric" });
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
  const [incDate, setIncDate] = useState(() => entryDate(month));

  // Txn form
  const firstBucket = state.buckets[0]?.id ?? "";
  const [txnBucket, setTxnBucket] = useState(firstBucket);
  const [txnLabel, setTxnLabel] = useState("");
  const [txnAmt, setTxnAmt] = useState("");
  const [txnAccount, setTxnAccount] = useState("");
  const [txnDate, setTxnDate] = useState(() => entryDate(month));

  // When the selected month changes, default both date pickers to that month.
  useEffect(() => {
    setIncDate(entryDate(month));
    setTxnDate(entryDate(month));
  }, [month]);

  // Which logged row is currently being edited in place.
  const [editIncomeId, setEditIncomeId] = useState<string | null>(null);
  const [editTxnId, setEditTxnId] = useState<string | null>(null);

  const selectedBucket = state.buckets.find((b) => b.id === txnBucket);
  const isSavings = selectedBucket?.type === "savings";

  function addIncome() {
    const amount = parseFloat(incAmt);
    if (!incLabel.trim() || isNaN(amount)) return;
    dispatch({
      type: "ADD_INCOME",
      month,
      entry: { id: uid(), label: incLabel.trim(), amount, date: incDate || entryDate(month) },
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
        date: txnDate || entryDate(month),
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
            <div className="field date">
              <label>Date</label>
              <input
                type="date"
                value={incDate}
                onChange={(e) => setIncDate(e.target.value)}
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
                {data.income.map((i) =>
                  editIncomeId === i.id ? (
                    <IncomeEditRow
                      key={i.id}
                      entry={i}
                      month={month}
                      onDone={() => setEditIncomeId(null)}
                    />
                  ) : (
                    <tr key={i.id}>
                      <td className="subtle" style={{ whiteSpace: "nowrap" }}>{fmtDay(i.date)}</td>
                      <td>{i.label}</td>
                      <td className="num">{fmt(i.amount)}</td>
                      <td className="actions">
                        <button className="small" onClick={() => setEditIncomeId(i.id)}>
                          Edit
                        </button>{" "}
                        <button
                          className="danger small"
                          onClick={() => dispatch({ type: "DELETE_INCOME", month, id: i.id })}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                <tr className="total-row">
                  <td />
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
              Create some buckets first (in the Buckets section below) so you have categories to assign.
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
                    {BUCKET_GROUPS.map((g) => {
                      const bs = state.buckets.filter((b) => b.type === g.type);
                      return bs.length ? (
                        <optgroup key={g.type} label={g.label}>
                          {bs.map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name}
                            </option>
                          ))}
                        </optgroup>
                      ) : null;
                    })}
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
                <div className="field date">
                  <label>Date</label>
                  <input
                    type="date"
                    value={txnDate}
                    onChange={(e) => setTxnDate(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTxn()}
                  />
                </div>
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
                  Add entry
                </button>
              </div>

              {data.txns.length === 0 ? (
                <div className="empty">Nothing logged yet this month.</div>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 64 }}>Date</th>
                      <th>Bucket</th>
                      <th>Description</th>
                      <th className="num">Amount</th>
                      <th className="actions"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.txns.map((t) => {
                      const b = state.buckets.find((x) => x.id === t.bucketId);
                      return editTxnId === t.id ? (
                        <TxnEditRow
                          key={t.id}
                          txn={t}
                          month={month}
                          buckets={state.buckets}
                          onDone={() => setEditTxnId(null)}
                        />
                      ) : (
                        <tr key={t.id}>
                          <td className="subtle" style={{ whiteSpace: "nowrap" }}>{fmtDay(t.date)}</td>
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
                            <button className="small" onClick={() => setEditTxnId(t.id)}>
                              Edit
                            </button>{" "}
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
                      <td />
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

function IncomeEditRow({
  entry,
  month,
  onDone,
}: {
  entry: IncomeEntry;
  month: string;
  onDone: () => void;
}) {
  const { dispatch } = useStore();
  const [label, setLabel] = useState(entry.label);
  const [amt, setAmt] = useState(String(entry.amount));
  const [date, setDate] = useState(entry.date ?? "");

  function save() {
    const amount = parseFloat(amt);
    dispatch({
      type: "UPDATE_INCOME",
      month,
      entry: {
        ...entry,
        label: label.trim() || entry.label,
        amount: isNaN(amount) ? entry.amount : amount,
        date: date || entry.date,
      },
    });
    onDone();
  }

  return (
    <tr>
      <td>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 140 }}
        />
      </td>
      <td>
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </td>
      <td className="num">
        <input
          type="number"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 110 }}
        />
      </td>
      <td className="actions">
        <button className="primary small" onClick={save}>
          Save
        </button>{" "}
        <button className="small ghost" onClick={onDone}>
          Cancel
        </button>
      </td>
    </tr>
  );
}

function TxnEditRow({
  txn,
  month,
  buckets,
  onDone,
}: {
  txn: Txn;
  month: string;
  buckets: Bucket[];
  onDone: () => void;
}) {
  const { dispatch } = useStore();
  const [bucketId, setBucketId] = useState(txn.bucketId);
  const [label, setLabel] = useState(txn.label);
  const [amt, setAmt] = useState(String(txn.amount));
  const [date, setDate] = useState(txn.date ?? "");

  const isSavings = buckets.find((b) => b.id === bucketId)?.type === "savings";

  function save() {
    const amount = parseFloat(amt);
    dispatch({
      type: "UPDATE_TXN",
      month,
      txn: {
        ...txn,
        bucketId,
        label: label.trim(),
        amount: isNaN(amount) ? txn.amount : amount,
        date: date || txn.date,
        // Keep the savings account only while the bucket is still a savings bucket.
        accountId: isSavings ? txn.accountId : undefined,
      },
    });
    // Re-filing a transaction is the clearest signal of where this merchant
    // belongs — remember it so the nightly sync stops parking it.
    if (bucketId !== txn.bucketId) {
      const keyword = deriveKeyword(label.trim() || txn.label);
      if (keyword) dispatch({ type: "LEARN_CATEGORY", keyword, bucketId });
    }
    onDone();
  }

  return (
    <tr>
      <td>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 140 }}
        />
      </td>
      <td>
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          {BUCKET_GROUPS.map((g) => {
            const bs = buckets.filter((b) => b.type === g.type);
            return bs.length ? (
              <optgroup key={g.type} label={g.label}>
                {bs.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            ) : null;
          })}
        </select>
      </td>
      <td>
        <input value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
      </td>
      <td className="num">
        <input
          type="number"
          value={amt}
          onChange={(e) => setAmt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 100 }}
        />
      </td>
      <td className="actions">
        <button className="primary small" onClick={save}>
          Save
        </button>{" "}
        <button className="small ghost" onClick={onDone}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
