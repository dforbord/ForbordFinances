import { useMemo, useState } from "react";
import { useStore } from "../store";
import { fmt, monthLabel } from "../format";

interface MonthRow {
  month: string;
  income: number;
  txns: number;
  moneyIn: number;
  moneyOut: number;
}

/** Wipe every logged entry in one or more months, so a fresh statement can be
 *  re-imported over the top without fighting duplicate detection. */
export function ClearMonths({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { state, dispatch } = useStore();
  const [picked, setPicked] = useState<string[]>([]);
  const [arming, setArming] = useState(false);
  const [done, setDone] = useState<{ months: number; entries: number } | null>(null);

  // Newest first, and only months that actually hold something.
  const rows: MonthRow[] = useMemo(
    () =>
      Object.entries(state.months)
        .map(([m, d]) => ({
          month: m,
          income: d.income.length,
          txns: d.txns.length,
          moneyIn: d.income.reduce((s, i) => s + i.amount, 0),
          moneyOut: d.txns.reduce((s, t) => s + t.amount, 0),
        }))
        .filter((r) => r.income + r.txns > 0)
        .sort((a, b) => b.month.localeCompare(a.month)),
    [state.months],
  );

  const selected = rows.filter((r) => picked.includes(r.month));
  const entryCount = selected.reduce((s, r) => s + r.income + r.txns, 0);

  function toggle(m: string) {
    setArming(false);
    setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  }

  function clearNow() {
    const months = selected.map((r) => r.month);
    dispatch({ type: "CLEAR_MONTHS", months });
    // If the page is sitting on a month that no longer exists, the entry form
    // below would show a blank month with no hint why — leave it as-is but
    // nudge to the newest month that survived, if any.
    if (months.includes(month)) {
      const survivor = rows.find((r) => !months.includes(r.month));
      if (survivor) setMonth(survivor.month);
    }
    setDone({ months: months.length, entries: entryCount });
    setPicked([]);
    setArming(false);
  }

  return (
    <div className="section">
      <div className="card danger-card">
        <h2>Clear a month's entries</h2>
        <p className="subtle" style={{ marginTop: -4 }}>
          Deletes every logged income and expense in the months you pick, so you can re-upload a
          statement from scratch. Your buckets, goals, savings accounts, wallet, investments and
          learned categories are <strong>not</strong> touched.
        </p>

        {done && (
          <div className="clear-result">
            Cleared {done.entries} {done.entries === 1 ? "entry" : "entries"} from {done.months}{" "}
            {done.months === 1 ? "month" : "months"}. Those dates are open again — re-upload the
            statement whenever you're ready.
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty" style={{ marginTop: 12 }}>
            No months have any logged entries yet.
          </div>
        ) : (
          <>
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 34 }} />
                  <th>Month</th>
                  <th style={{ width: 150 }}>Entries</th>
                  <th className="num" style={{ width: 120 }}>In</th>
                  <th className="num" style={{ width: 120 }}>Out</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.month}>
                    <td>
                      <input
                        type="checkbox"
                        checked={picked.includes(r.month)}
                        onChange={() => toggle(r.month)}
                        aria-label={`Select ${monthLabel(r.month)}`}
                      />
                    </td>
                    <td>
                      <strong>{monthLabel(r.month)}</strong>
                    </td>
                    <td className="subtle">
                      {r.income} income · {r.txns} spending
                    </td>
                    <td className="num" style={{ color: "var(--green)" }}>
                      {fmt(r.moneyIn)}
                    </td>
                    <td className="num">{fmt(r.moneyOut)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="toolbar" style={{ marginTop: 14, alignItems: "center" }}>
              <button
                className="ghost small"
                onClick={() => {
                  setArming(false);
                  setPicked(picked.length === rows.length ? [] : rows.map((r) => r.month));
                }}
              >
                {picked.length === rows.length ? "Select none" : "Select all"}
              </button>

              {!arming ? (
                <button
                  className="danger"
                  disabled={selected.length === 0}
                  onClick={() => {
                    setDone(null);
                    setArming(true);
                  }}
                >
                  Clear {selected.length || ""} {selected.length === 1 ? "month" : "months"}
                </button>
              ) : (
                <>
                  <span style={{ fontSize: 14 }}>
                    Permanently delete <strong>{entryCount}</strong>{" "}
                    {entryCount === 1 ? "entry" : "entries"} from{" "}
                    <strong>{selected.map((r) => monthLabel(r.month)).join(", ")}</strong>?
                  </span>
                  <button className="danger" onClick={clearNow}>
                    Yes, delete
                  </button>
                  <button className="ghost small" onClick={() => setArming(false)}>
                    Cancel
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
