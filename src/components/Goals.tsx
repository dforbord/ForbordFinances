import { useState } from "react";
import { useStore, uid } from "../store";
import { computeGoal, GoalStats, GoalStatus } from "../selectors";
import { fmt, parseDate, todayKey } from "../format";
import { Goal } from "../types";

const COLORS = [
  "#6366f1", "#ec4899", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ef4444", "#14b8a6",
];

const STATUS_META: Record<GoalStatus, { label: string; color: string }> = {
  reached: { label: "🎉 Reached", color: "#10b981" },
  ahead: { label: "Ahead of pace", color: "#10b981" },
  "on-track": { label: "On pace", color: "#3b82f6" },
  behind: { label: "Behind pace", color: "#ef4444" },
  overdue: { label: "Past due", color: "#ef4444" },
};

function monthsText(m: number): string {
  if (m <= 0) return "due now";
  if (m < 1) return `${Math.round(m * 30.4375)} days left`;
  return `${m.toFixed(1)} months left`;
}

export function Goals() {
  const { state, dispatch } = useStore();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [startAmount, setStartAmount] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  function add() {
    const targetAmount = parseFloat(amount);
    if (!name.trim() || isNaN(targetAmount) || !date) return;
    dispatch({
      type: "ADD_GOAL",
      goal: {
        id: uid(),
        name: name.trim(),
        targetAmount,
        targetDate: date,
        startDate: todayKey(),
        startAmount: parseFloat(startAmount) || 0,
        contributions: [],
        color: COLORS[state.goals.length % COLORS.length],
      },
    });
    setName("");
    setAmount("");
    setDate("");
    setStartAmount("");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Goals</h1>
          <div className="subtle">Set a target and date, log what you save, see if you're on pace</div>
        </div>
      </div>

      <div className="card">
        <div className="row-form">
          <div className="field grow">
            <label>Goal name</label>
            <input
              placeholder="e.g. House down payment"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="field amt">
            <label>Target amount</label>
            <input
              type="number"
              placeholder="10000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field" style={{ width: 160 }}>
            <label>Target date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field amt">
            <label>Already saved</label>
            <input
              type="number"
              placeholder="0"
              value={startAmount}
              onChange={(e) => setStartAmount(e.target.value)}
            />
          </div>
          <button className="primary" onClick={add}>
            Add Goal
          </button>
        </div>
        <div className="help">
          “Already saved” is what you've put aside so far today. After that, use{" "}
          <strong>Add amount</strong> on the goal to log money as you save it — that drives your
          pace and projection.
        </div>
      </div>

      <div className="section">
        {state.goals.length === 0 ? (
          <div className="empty">No goals yet. Add one above to start tracking.</div>
        ) : (
          state.goals.map((g) =>
            editingId === g.id ? (
              <EditGoal
                key={g.id}
                goal={g}
                onSave={(updated) => {
                  dispatch({ type: "UPDATE_GOAL", goal: updated });
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <GoalCard
                key={g.id}
                goal={g}
                stats={computeGoal(state, g)}
                onEdit={() => setEditingId(g.id)}
                onDelete={() => {
                  if (confirm(`Delete goal “${g.name}”?`)) {
                    dispatch({ type: "DELETE_GOAL", id: g.id });
                  }
                }}
              />
            ),
          )
        )}
      </div>
    </>
  );
}

function GoalCard({
  goal,
  stats,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  stats: GoalStats;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { dispatch } = useStore();
  const meta = STATUS_META[stats.status];
  const savedPct = stats.fractionSaved * 100;
  const markerPct = stats.expectedFractionOfTarget * 100;

  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [showLog, setShowLog] = useState(false);

  function addContribution() {
    const value = parseFloat(amt);
    if (isNaN(value)) return;
    dispatch({
      type: "ADD_GOAL_CONTRIB",
      goalId: goal.id,
      contribution: { id: uid(), date: todayKey(), amount: value, note: note.trim() || undefined },
    });
    setAmt("");
    setNote("");
  }

  const recent = [...(goal.contributions ?? [])].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);

  return (
    <div className="card goal-card" style={{ borderLeft: `4px solid ${goal.color}` }}>
      <div className="goal-head">
        <div>
          <h2 style={{ margin: 0 }}>{goal.name}</h2>
          <div className="subtle">
            {fmt(stats.saved)} of {fmt(stats.target)} ·{" "}
            {parseDate(goal.targetDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {monthsText(stats.monthsLeft)}
          </div>
        </div>
        <span className="tag" style={{ background: meta.color + "22", color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="goalbar" title={`Plan says you should be at ${fmt(stats.expectedByNow)}`}>
        <div className="goalbar-fill" style={{ width: `${savedPct}%`, background: goal.color }} />
        {stats.status !== "reached" && (
          <div className="goalbar-marker" style={{ left: `${markerPct}%` }} />
        )}
      </div>
      <div className="goalbar-legend subtle">
        <span>{savedPct.toFixed(0)}% saved</span>
        <span>▮ marker = on-pace target now ({fmt(stats.expectedByNow)})</span>
      </div>

      <div className="goal-stats">
        <Stat label="Remaining" value={fmt(stats.remaining)} />
        <Stat label="Save each month" value={`${fmt(stats.requiredMonthly)}/mo`} big />
        <Stat
          label={stats.delta >= 0 ? "Ahead by" : "Behind by"}
          value={fmt(Math.abs(stats.delta))}
        />
      </div>

      <div className="goal-callout" style={{ background: meta.color + "16", color: meta.color }}>
        {stats.status === "reached" && <>Goal reached — nicely done.</>}
        {stats.status === "ahead" && (
          <>
            You're <strong>{fmt(stats.aheadAmount)} ahead</strong> of an even pace. From here you
            only need <strong>{fmt(stats.requiredMonthly)}/mo</strong> to finish on time
            {stats.baselineMonthly > stats.requiredMonthly + 1
              ? ` (under your ${fmt(stats.baselineMonthly)}/mo starting plan)`
              : ""}
            .
          </>
        )}
        {stats.status === "on-track" && (
          <>
            On pace. Keep saving <strong>{fmt(stats.requiredMonthly)}/mo</strong> to land on time.
          </>
        )}
        {stats.status === "behind" && (
          <>
            You're <strong>{fmt(stats.behindAmount)} behind</strong> an even pace. Save{" "}
            <strong>{fmt(stats.requiredMonthly)}/mo</strong> from here to catch up and still finish
            on time
            {stats.extraPerMonth > 1
              ? ` — that's ${fmt(stats.extraPerMonth)}/mo more than your ${fmt(
                  stats.baselineMonthly,
                )}/mo starting plan`
              : ""}
            .
          </>
        )}
        {stats.status === "overdue" && (
          <>Target date passed with {fmt(stats.remaining)} to go. Edit the date or add the rest.</>
        )}
      </div>

      <div className="row-form" style={{ marginTop: 14, marginBottom: 0 }}>
        <div className="field amt">
          <label>Add amount</label>
          <input
            type="number"
            placeholder="0.00"
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addContribution()}
          />
        </div>
        <div className="field grow">
          <label>Note (optional)</label>
          <input
            placeholder="e.g. Bonus, transfer"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addContribution()}
          />
        </div>
        <button className="primary" onClick={addContribution}>
          ＋ Add to goal
        </button>
      </div>

      {recent.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="linklike" onClick={() => setShowLog((s) => !s)}>
            {showLog ? "Hide" : "Show"} contributions ({(goal.contributions ?? []).length})
          </button>
          {showLog && (
            <table className="table" style={{ marginTop: 8 }}>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td style={{ width: 120 }}>
                      {parseDate(c.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td>{c.note ?? ""}</td>
                    <td className="num">{fmt(c.amount)}</td>
                    <td className="actions">
                      <button
                        className="small danger"
                        onClick={() =>
                          dispatch({
                            type: "DELETE_GOAL_CONTRIB",
                            goalId: goal.id,
                            contribId: c.id,
                          })
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="small" onClick={onEdit}>
          Edit goal
        </button>
        <button className="small danger" onClick={onDelete}>
          Delete goal
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="goal-stat">
      <div className="subtle">{label}</div>
      <div className={`goal-stat-value ${big ? "big" : ""}`}>{value}</div>
    </div>
  );
}

function EditGoal({
  goal,
  onSave,
  onCancel,
}: {
  goal: Goal;
  onSave: (g: Goal) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(goal.name);
  const [amount, setAmount] = useState(String(goal.targetAmount));
  const [date, setDate] = useState(goal.targetDate);
  const [startDate, setStartDate] = useState(goal.startDate);
  const [startAmount, setStartAmount] = useState(String(goal.startAmount));

  return (
    <div className="card" style={{ borderLeft: `4px solid ${goal.color}` }}>
      <div className="row-form">
        <div className="field grow">
          <label>Goal name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field amt">
          <label>Target amount</label>
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label>Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field" style={{ width: 150 }}>
          <label>Target date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="field amt">
          <label>Already saved</label>
          <input
            type="number"
            value={startAmount}
            onChange={(e) => setStartAmount(e.target.value)}
          />
        </div>
      </div>
      <div className="toolbar">
        <button
          className="primary small"
          onClick={() =>
            onSave({
              ...goal,
              name: name.trim() || goal.name,
              targetAmount: parseFloat(amount) || 0,
              targetDate: date,
              startDate,
              startAmount: parseFloat(startAmount) || 0,
            })
          }
        >
          Save
        </button>
        <button className="small ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
