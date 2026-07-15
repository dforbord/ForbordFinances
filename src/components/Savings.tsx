import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { fmt } from "../format";
import { Account } from "../types";

export function Savings() {
  const { state, dispatch } = useStore();

  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sum all savings contributions per account across every month.
  const { byAccount, unassigned } = useMemo(() => {
    const savingsBucketIds = new Set(
      state.buckets.filter((b) => b.type === "savings").map((b) => b.id),
    );
    const byAccount = new Map<string, number>();
    let unassigned = 0;
    for (const m of Object.values(state.months)) {
      for (const t of m.txns) {
        if (!savingsBucketIds.has(t.bucketId)) continue;
        if (t.accountId) {
          byAccount.set(t.accountId, (byAccount.get(t.accountId) ?? 0) + t.amount);
        } else {
          unassigned += t.amount;
        }
      }
    }
    return { byAccount, unassigned };
  }, [state.months, state.buckets]);

  function add() {
    if (!name.trim()) return;
    dispatch({
      type: "ADD_ACCOUNT",
      account: { id: uid(), name: name.trim(), startingBalance: parseFloat(start) || 0 },
    });
    setName("");
    setStart("");
  }

  const grandTotal =
    state.accounts.reduce(
      (s, a) => s + a.startingBalance + (byAccount.get(a.id) ?? 0),
      0,
    ) + unassigned;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Savings Accounts</h1>
          <div className="subtle">
            Balances grow as you log savings contributions in Log Entries
          </div>
        </div>
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Total Saved</div>
          <div className="value blue">{fmt(grandTotal)}</div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="row-form">
            <div className="field grow">
              <label>Account name</label>
              <input
                placeholder="e.g. High-Yield Savings"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="field amt">
              <label>Starting balance</label>
              <input
                type="number"
                placeholder="0.00"
                value={start}
                onChange={(e) => setStart(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="primary" onClick={add}>
              Add Account
            </button>
          </div>

          {state.accounts.length === 0 ? (
            <div className="empty">No accounts yet. Add one above.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="num">Starting</th>
                  <th className="num">Contributions</th>
                  <th className="num">Current balance</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {state.accounts.map((a) =>
                  editingId === a.id ? (
                    <EditRow
                      key={a.id}
                      account={a}
                      contributions={byAccount.get(a.id) ?? 0}
                      onSave={(updated) => {
                        dispatch({ type: "UPDATE_ACCOUNT", account: updated });
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={a.id}>
                      <td>{a.name}</td>
                      <td className="num">{fmt(a.startingBalance)}</td>
                      <td className="num">{fmt(byAccount.get(a.id) ?? 0)}</td>
                      <td className="num">
                        <strong>{fmt(a.startingBalance + (byAccount.get(a.id) ?? 0))}</strong>
                      </td>
                      <td className="actions">
                        <button className="small" onClick={() => setEditingId(a.id)}>
                          Edit
                        </button>{" "}
                        <button
                          className="danger small"
                          onClick={() => {
                            if (confirm(`Delete account “${a.name}”?`)) {
                              dispatch({ type: "DELETE_ACCOUNT", id: a.id });
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                {unassigned > 0 && (
                  <tr className="muted-row">
                    <td>Unassigned savings</td>
                    <td className="num">—</td>
                    <td className="num">{fmt(unassigned)}</td>
                    <td className="num">{fmt(unassigned)}</td>
                    <td />
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <div className="help">
            To add money here, go to <strong>Log Entries</strong>, log an amount under a{" "}
            <strong>savings</strong> bucket, and pick this account in the “Into account” dropdown.
          </div>
        </div>
      </div>
    </>
  );
}

function EditRow({
  account,
  contributions,
  onSave,
  onCancel,
}: {
  account: Account;
  contributions: number;
  onSave: (a: Account) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(account.name);
  const [start, setStart] = useState(String(account.startingBalance));

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td className="num">
        <input
          type="number"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          style={{ width: 110 }}
        />
      </td>
      <td className="num">{fmt(contributions)}</td>
      <td className="num">{fmt((parseFloat(start) || 0) + contributions)}</td>
      <td className="actions">
        <button
          className="primary small"
          onClick={() =>
            onSave({
              ...account,
              name: name.trim() || account.name,
              startingBalance: parseFloat(start) || 0,
            })
          }
        >
          Save
        </button>{" "}
        <button className="small ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
