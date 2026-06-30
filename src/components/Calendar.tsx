import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { monthKey } from "../storage";
import { dateKey, dayLabel, fmt, parseDate, todayKey } from "../format";
import { PlannedExpense } from "../types";
import { MonthSwitch } from "./MonthSwitch";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayItem {
  p: PlannedExpense;
  isStart: boolean;
  isEnd: boolean;
}

function expenseEnd(p: PlannedExpense): string {
  return p.endDate && p.endDate > p.date ? p.endDate : p.date;
}

function rangeText(p: PlannedExpense): string {
  const start = parseDate(p.date);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (expenseEnd(p) === p.date) return start.toLocaleDateString("en-US", opts);
  return `${start.toLocaleDateString("en-US", opts)} – ${parseDate(expenseEnd(p)).toLocaleDateString(
    "en-US",
    opts,
  )}`;
}

export function Calendar() {
  const { state, dispatch } = useStore();
  const [calMonth, setCalMonth] = useState(monthKey(new Date()));
  const [selected, setSelected] = useState(todayKey());

  const [y, m] = calMonth.split("-").map(Number);
  const monthStart = `${calMonth}-01`;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthEnd = `${calMonth}-${String(daysInMonth).padStart(2, "0")}`;

  // Expand each expense across the days it covers within this month.
  const { byDate, monthTotal } = useMemo(() => {
    const byDate = new Map<string, DayItem[]>();
    let monthTotal = 0;
    for (const p of state.plannedExpenses) {
      const end = expenseEnd(p);
      if (end < monthStart || p.date > monthEnd) continue; // no overlap
      monthTotal += p.amount;
      const from = p.date < monthStart ? monthStart : p.date;
      const to = end > monthEnd ? monthEnd : end;
      let cur = parseDate(from);
      const last = parseDate(to);
      while (cur <= last) {
        const k = dateKey(cur);
        const arr = byDate.get(k) ?? [];
        arr.push({ p, isStart: k === p.date, isEnd: k === end });
        byDate.set(k, arr);
        cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1);
      }
    }
    return { byDate, monthTotal };
  }, [state.plannedExpenses, calMonth, monthStart, monthEnd]);

  const upcoming = useMemo(() => {
    const today = todayKey();
    return [...state.plannedExpenses]
      .filter((p) => expenseEnd(p) >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 8);
  }, [state.plannedExpenses]);

  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${calMonth}-${String(d).padStart(2, "0")}`);

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
          {state.buckets.length === 0 ? (
            <div className="empty">Create a bucket first — calendar expenses are filed into one.</div>
          ) : (
            <AddPlannedForm
              date={selected}
              onAdd={(planned) => dispatch({ type: "ADD_PLANNED", planned })}
            />
          )}
          {selectedItems.length === 0 ? (
            <div className="empty">Nothing planned for this day.</div>
          ) : (
            <table className="table">
              <tbody>
                {selectedItems.map(({ p }) => {
                  const bucket = state.buckets.find((b) => b.id === p.bucketId);
                  const multi = expenseEnd(p) !== p.date;
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="dot" style={{ background: p.color }} />
                        {p.label}
                        {multi && <span className="subtle"> · {rangeText(p)}</span>}
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
                    <td style={{ width: 170 }}>
                      <button
                        className="linklike"
                        onClick={() => {
                          setCalMonth(p.date.slice(0, 7));
                          setSelected(p.date);
                        }}
                      >
                        {rangeText(p)}
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
  items: DayItem[];
  isToday: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  // Count an expense's amount once, on its start day, so a multi-day block
  // doesn't inflate daily totals.
  const total = items.reduce((s, it) => s + (it.isStart ? it.p.amount : 0), 0);
  const dayNum = Number(dateKeyStr.slice(-2));
  return (
    <div
      className={`cal-cell ${isSelected ? "selected" : ""} ${isToday ? "today" : ""}`}
      onClick={onClick}
    >
      <div className="cal-day-num">{dayNum}</div>
      <div className="cal-items">
        {items.slice(0, 3).map((it) => (
          <div
            key={it.p.id}
            className={`cal-item ${it.isStart ? "" : "cal-item-cont"}`}
            style={{ borderLeftColor: it.p.color }}
          >
            <span className="cal-item-label">
              {it.isStart ? it.p.label : `↔ ${it.p.label}`}
            </span>
            {it.isStart && <span className="cal-item-amt">{fmt(it.p.amount)}</span>}
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
  onAdd: (p: PlannedExpense) => void;
}) {
  const { state } = useStore();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [bucketId, setBucketId] = useState(state.buckets[0]?.id ?? "");
  const [multiDay, setMultiDay] = useState(false);
  const [endDate, setEndDate] = useState("");

  function submit() {
    const amt = parseFloat(amount);
    const bucket = state.buckets.find((b) => b.id === bucketId);
    if (!label.trim() || isNaN(amt) || !bucket) return;
    const end = multiDay && endDate && endDate > date ? endDate : undefined;
    onAdd({
      id: uid(),
      date,
      endDate: end,
      label: label.trim(),
      amount: amt,
      bucketId: bucket.id,
      color: bucket.color,
    });
    setLabel("");
    setAmount("");
    setMultiDay(false);
    setEndDate("");
  }

  return (
    <>
      <div className="row-form" style={{ marginBottom: 8 }}>
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
          <label>Bucket</label>
          <select value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
            {state.buckets.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <button className="primary" onClick={submit}>
          Add
        </button>
      </div>
      <div className="cal-multi">
        <label className="cal-check">
          <input
            type="checkbox"
            checked={multiDay}
            onChange={(e) => {
              setMultiDay(e.target.checked);
              if (e.target.checked && !endDate) setEndDate(date);
            }}
          />
          Block off multiple days
        </label>
        {multiDay && (
          <span className="cal-range-inputs">
            from <strong>{parseDate(date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</strong> to{" "}
            <input
              type="date"
              value={endDate}
              min={date}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ width: 160, display: "inline-block" }}
            />
          </span>
        )}
      </div>
    </>
  );
}
