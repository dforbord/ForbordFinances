import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { fmt, monthLabel } from "../format";
import { monthKey } from "../storage";
import { BusinessExpense } from "../types";

export function Business() {
  const { state, dispatch } = useStore();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState<string>(monthKey(new Date()));
  const [editingId, setEditingId] = useState<string | null>(null);

  const expenses = state.businessExpenses;

  // Running totals for the little dashboard up top.
  const { total, thisMonth } = useMemo(() => {
    const nowKey = monthKey(new Date());
    let total = 0;
    let thisMonth = 0;
    for (const e of expenses) {
      total += e.amount;
      if (e.month === nowKey) thisMonth += e.amount;
    }
    return { total, thisMonth };
  }, [expenses]);

  // Most recent month first, then newest-added within a month.
  const sorted = useMemo(
    () => [...expenses].sort((a, b) => b.month.localeCompare(a.month)),
    [expenses],
  );

  function add() {
    const amt = parseFloat(amount);
    if (!name.trim() || !(amt > 0) || !month) return;
    dispatch({
      type: "ADD_BUSINESS_EXPENSE",
      expense: { id: uid(), name: name.trim(), amount: amt, month },
    });
    setName("");
    setAmount("");
    // Keep the selected month so logging several in one month is quick.
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Business Expenses</h1>
          <div className="subtle">Log business expenses and track a running total</div>
        </div>
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Total Logged</div>
          <div className="value blue">{fmt(total)}</div>
        </div>
        <div className="card stat">
          <div className="label">This Month</div>
          <div className="value green">{fmt(thisMonth)}</div>
        </div>
        <div className="card stat">
          <div className="label">Entries</div>
          <div className="value amber">{expenses.length}</div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="row-form">
            <div className="field grow">
              <label>Expense name</label>
              <input
                placeholder="e.g. Adobe subscription"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="field amt">
              <label>Amount</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="field amt">
              <label>Month charged</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="primary" onClick={add}>
              Add Expense
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="empty">No business expenses yet. Add one above.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Expense</th>
                  <th>Month charged</th>
                  <th className="num">Amount</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((e) =>
                  editingId === e.id ? (
                    <EditRow
                      key={e.id}
                      expense={e}
                      onSave={(updated) => {
                        dispatch({ type: "UPDATE_BUSINESS_EXPENSE", expense: updated });
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={e.id}>
                      <td>{e.name}</td>
                      <td>{monthLabel(e.month)}</td>
                      <td className="num">{fmt(e.amount)}</td>
                      <td className="actions">
                        <button className="small" onClick={() => setEditingId(e.id)}>
                          Edit
                        </button>{" "}
                        <button
                          className="danger small"
                          onClick={() => {
                            if (confirm(`Delete “${e.name}”?`)) {
                              dispatch({ type: "DELETE_BUSINESS_EXPENSE", id: e.id });
                            }
                          }}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ),
                )}
                <tr className="muted-row">
                  <td>
                    <strong>Total</strong>
                  </td>
                  <td />
                  <td className="num">
                    <strong>{fmt(total)}</strong>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function EditRow({
  expense,
  onSave,
  onCancel,
}: {
  expense: BusinessExpense;
  onSave: (e: BusinessExpense) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(expense.name);
  const [amount, setAmount] = useState(String(expense.amount));
  const [month, setMonth] = useState(expense.month);

  function save() {
    onSave({
      ...expense,
      name: name.trim() || expense.name,
      amount: parseFloat(amount) || expense.amount,
      month: month || expense.month,
    });
  }

  return (
    <tr>
      <td>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </td>
      <td>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          style={{ width: 150 }}
        />
      </td>
      <td className="num">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          style={{ width: 110 }}
        />
      </td>
      <td className="actions">
        <button className="primary small" onClick={save}>
          Save
        </button>{" "}
        <button className="small ghost" onClick={onCancel}>
          Cancel
        </button>
      </td>
    </tr>
  );
}
