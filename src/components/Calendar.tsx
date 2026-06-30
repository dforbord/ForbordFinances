import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { monthKey } from "../storage";
import { dayLabel, fmt, parseDate, todayKey } from "../format";
import { MonthSwitch } from "./MonthSwitch";

const COLORS = [
  "#ef4444", "#f59e0b", "#6366f1", "#ec4899",
  "#10b981", "#3b82f6", "#8b5cf6", "#14b8a6",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function Calendar() {
  const { state, dispatch } = useStore();
  const [calMonth, setCalMonth] = useState(monthKey(new Date()));
  const [selected, setSelected] = useState(todayKey());

  // Planned expenses for the visible month, grouped by date key.
  const { byDate, monthTotal } = useMemo(() => {
    const byDate = new Map<string, typeof state.plannedExpenses>();
    let monthTotal = 0;
    for (const p of state.plannedExpenses) {
      if (!p.date.startsWith(calMonth)) continue;
      monthTotal += p.amount;
      const arr = byDate.get(p.date) ?? [];
      arr.push(p);
      byDate.set(p.date, arr);
    }
    return { byDate, monthTotal };
  }, [state.plannedExpenses, calMonth]);

  const upcoming = useMemo(() => {
    const today = todayKey();
    return [...state.plannedExpenses]
      .filter((p) => p.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [state.plannedExpenses]);

  const [y, m] = calMonth.split("-").map(Number);
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const daysInMonth = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${calMonth}-${String(d).padStart(2, "0")}`);
  }

  const selectedItems = byDate.get(selected) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Expense Calendar</h1>
          <div className="subtle">Plan ahead for travel, events, and big one-off costs</div>
        </div>
        <MonthSwitch month={calMonth} setMonth={setCalMonth} />
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Planned this month</div>
          <div className="value amber">{fmt(monthTotal)}</div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="cal-dow">
            {DOW.map((d) => (
              <div key={d} className="cal-dow-cell">
                {d}
              </div>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((key, i) =>
              key === null ? (
                <div key={`b${i}`} className="cal-cell empty-cell" />
              ) : (
                <CalCell
                  key={key}
                  dateKeyStr={key}
                  items={byDate.get(key) ?? []}
                  isToday={key === todayKey()}
                  isSelected={key === selected}
                  onClick={() => setSelected(key)}
                />
              ),
            )}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <h2>{dayLabel(selected)}</h2>
          <AddPlannedForm
            date={selected}
            onAdd={(planned) => dispatch({ type: "ADD_PLANNED", planned })}
          />
          {selectedItems.length === 0 ? (
            <div className="empty">Nothing planned for this day. Add something above.</div>
          ) : (
            <table className="table">
              <tbody>
                {selectedItems.map((p) => {
                  const bucket = state.buckets.find((b) => b.id === p.bucketId);
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="dot" style={{ background: p.color }} />
                        {p.label}
                        {bucket ? <span className="subtle"> · {bucket.name}</span> : null}
                      </td>
                      <td className="num">{fmt(p.amount)}</td>
                      <td className="actions">
                        <button
                          className="small danger"
                          onClick={() => dispatch({ type: "DELETE_PLANNED", id: p.id })}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {upcoming.length > 0 && (
        <div className="section">
          <h2>Upcoming</h2>
          <div className="card">
            <table className="table">
              <tbody>
                {upcoming.map((p) => (
                  <tr key={p.id}>
                    <td style={{ width: 160 }}>
                      <button
                        className="linklike"
                        onClick={() => {
                          setCalMonth(p.date.slice(0, 7));
                          setSelected(p.date);
                        }}
                      >
                        {parseDate(p.date).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
                      </button>
                    </td>
                    <td>
                      <span className="dot" style={{ background: p.color }} />
                      {p.label}
                    </td>
                    <td className="num">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function CalCell({
  dateKeyStr,
  items,
  isToday,
  isSelected,
  onClick,
}: {
  dateKeyStr: string;
  items: { id: string; amount: number; color: string; label: string }[];
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const total = items.reduce((s, p) => s + p.amount, 0);
  const dayNum = Number(dateKeyStr.slice(-2));
  return (
    <div
      className={`cal-cell ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
      onClick={onClick}
    >
      <div className="cal-day-num">{dayNum}</div>
      <div className="cal-items">
        {items.slice(0, 3).map((p) => (
          <div key={p.id} className="cal-item" style={{ borderLeftColor: p.color }}>
            <span className="cal-item-label">{p.label}</span>
            <span className="cal-item-amt">{fmt(p.amount)}</span>
          </div>
        ))}
        {items.length > 3 && <div className="cal-more">+{items.length - 3} more</div>}
      </div>
      {total > 0 && <div className="cal-total">{fmt(total)}</div>}
    </div>
  );
}

function AddPlannedForm({
  date,
  onAdd,
}: {
  date: string;
  onAdd: (p: {
    id: string;
    date: string;
    label: string;
    amount: number;
    bucketId?: string;
    color: string;
  }) => void;
}) {
  const { state } = useStore();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [bucketId, setBucketId] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  function submit() {
    const amt = parseFloat(amount);
    if (!label.trim() || isNaN(amt)) return;
    onAdd({
      id: uid(),
      date,
      label: label.trim(),
      amount: amt,
      bucketId: bucketId || undefined,
      color,
    });
    setLabel("");
    setAmount("");
  }

  return (
    <div className="row-form">
      <div className="field grow">
        <label>What's the expense?</label>
        <input
          placeholder="e.g. Flights to Denver"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="field amt">
        <label>Amount</label>
        <input
          type="number"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </div>
      <div className="field type">
        <label>Category (optional)</label>
        <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          <option value="">— none —</option>
          {state.buckets.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field" style={{ width: 96 }}>
        <label>Color</label>
        <select value={color} onChange={(e) => setColor(e.target.value)}>
          {COLORS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <button className="primary" onClick={submit}>
        Add
      </button>
    </div>
  );
}
