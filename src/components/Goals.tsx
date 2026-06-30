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
  "on-track": { label: "On track", color: "#3b82f6" },
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
  const [accountId, setAccountId] = useState("");
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
        accountId: accountId || undefined,
        color: COLORS[state.goals.length % COLORS.length],
      },
    });
    setName("");
    setAmount("");
    setDate("");
    setStartAmount("");
    setAccountId("");
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Goals</h1>
          <div className="subtle">Set a target and date — see whether you're on track</div>
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
          <div className="field type">
            <label>Track via account</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">— none —</option>
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
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
          Link a <strong>savings account</strong> and progress tracks its balance automatically as
          you log contributions. “Already saved” marks where the plan starts today.
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
                accountName={state.accounts.find((a) => a.id === g.accountId)?.name}
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
  accountName,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  stats: GoalStats;
  accountName?: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = STATUS_META[stats.status];
  const savedPct = stats.fractionSaved * 100;
  const markerPct = stats.expectedFractionOfTarget * 100;

  return (
    <div className="card goal-card" style={{ borderLeft: `4px solid ${goal.color}` }}>
      <div className="goal-head">
        <div>
          <h2 style={{ margin: 0 }}>{goal.name}</h2>
          <div className="subtle">
            {fmt(stats.saved)} of {fmt(stats.target)} ·{" "}
            {new Date(parseDate(goal.targetDate)).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · {monthsText(stats.monthsLeft)}
            {accountName ? ` · ${accountName}` : ""}
          </div>
        </div>
        <span className="tag" style={{ background: meta.color + "22", color: meta.color }}>
          {meta.label}
        </span>
      </div>

      <div className="goalbar" title={`Target pace marker at ${fmt(stats.expectedByNow)}`}>
        <div className="goalbar-fill" style={{ width: `${savedPct}%`, background: goal.color }} />
        {stats.status !== "reached" && (
          <div className="goalbar-marker" style={{ left: `${markerPct}%` }} />
        )}
      </div>
      <div className="goalbar-legend subtle">
        <span>{savedPct.toFixed(0)}% saved</span>
        <span>▮ marker = where the plan says you should be ({fmt(stats.expectedByNow)})</span>
      </div>

      <div className="goal-stats">
        <Stat label="Remaining" value={fmt(stats.remaining)} />
        <Stat label="To stay on pace" value={`${fmt(stats.requiredMonthly)}/mo`} />
        {stats.runRate > 0 && (
          <Stat label="Your recent pace" value={`${fmt(stats.runRate)}/mo`} />
        )}
      </div>

      <div className="goal-callout" style={{ background: meta.color + "16", color: meta.color }}>
        {stats.status === "reached" && <>Goal reached — nicely done.</>}
        {stats.status === "ahead" && (
          <>
            You're <strong>{fmt(stats.aheadAmount)} ahead</strong> of schedule. Keep saving{" "}
            {fmt(stats.requiredMonthly)}/mo and you'll arrive early.
          </>
        )}
        {stats.status === "on-track" && (
          <>On track — keep saving about {fmt(stats.requiredMonthly)}/mo to land on time.</>
        )}
        {stats.status === "behind" && (
          <>
            You're <strong>{fmt(stats.behindAmount)} behind</strong> pace. Save{" "}
            <strong>{fmt(stats.catchUpNextMonth)}</strong> next month to get back on track (or{" "}
            {fmt(stats.requiredMonthly)}/mo every month from here).
          </>
        )}
        {stats.status === "overdue" && (
          <>
            Target date has passed with {fmt(stats.remaining)} still to go. Pick a new date or add{" "}
            {fmt(stats.remaining)}.
          </>
        )}
      </div>

      {stats.runRate > 0 && stats.status !== "reached" && (
        <div className="help">
          At your recent pace you'll have about <strong>{fmt(stats.projectedFinal)}</strong> by the
          deadline —{" "}
          {stats.projectedDelta >= 0
            ? `${fmt(stats.projectedDelta)} over goal.`
            : `${fmt(-stats.projectedDelta)} short.`}
        </div>
      )}

      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="small" onClick={onEdit}>
          Edit
        </button>
        <button className="small danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="goal-stat">
      <div className="subtle">{label}</div>
      <div className="goal-stat-value">{value}</div>
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
  const { state } = useStore();
  const [name, setName] = useState(goal.name);
  const [amount, setAmount] = useState(String(goal.targetAmount));
  const [date, setDate] = useState(goal.targetDate);
  const [startDate, setStartDate] = useState(goal.startDate);
  const [accountId, setAccountId] = useState(goal.accountId ?? "");
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
        <div className="field type">
          <label>Track via account</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">— none —</option>
            {state.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
              accountId: accountId || undefined,
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
