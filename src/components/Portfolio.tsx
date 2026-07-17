import { useMemo, useState } from "react";
import { useStore, uid } from "../store";
import { fmt, todayKey } from "../format";
import { Investment } from "../types";

/** Stable slice colors, assigned to tickers by size rank. */
const PIE_PALETTE = [
  "#6366f1", "#10b981", "#f59e0b", "#ec4899", "#3b82f6",
  "#8b5cf6", "#14b8a6", "#ef4444", "#84cc16", "#f97316",
  "#06b6d4", "#a855f7",
];

interface Slice {
  ticker: string;
  total: number;
  pct: number;
  color: string;
  entries: number;
}

export function Portfolio() {
  const { state, dispatch } = useStore();

  const [ticker, setTicker] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string>(todayKey());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [hoverTicker, setHoverTicker] = useState<string | null>(null);

  const investments = state.investments;

  // Aggregate entries into one slice per ticker, largest first.
  const { slices, total } = useMemo(() => {
    const byTicker = new Map<string, { total: number; entries: number }>();
    let total = 0;
    for (const inv of investments) {
      const cur = byTicker.get(inv.ticker) ?? { total: 0, entries: 0 };
      cur.total += inv.amount;
      cur.entries += 1;
      byTicker.set(inv.ticker, cur);
      total += inv.amount;
    }
    const slices: Slice[] = [...byTicker.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([ticker, agg], i) => ({
        ticker,
        total: agg.total,
        pct: total > 0 ? (agg.total / total) * 100 : 0,
        color: PIE_PALETTE[i % PIE_PALETTE.length],
        entries: agg.entries,
      }));
    return { slices, total };
  }, [investments]);

  // Newest first for the log table.
  const sorted = useMemo(
    () => [...investments].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
    [investments],
  );

  const colorOf = (t: string) => slices.find((s) => s.ticker === t)?.color ?? "var(--muted)";

  function add() {
    const amt = parseFloat(amount);
    const tick = ticker.trim().toUpperCase();
    if (!tick || !(amt > 0)) return;
    dispatch({
      type: "ADD_INVESTMENT",
      investment: { id: uid(), ticker: tick, amount: amt, date: date || undefined },
    });
    setTicker("");
    setAmount("");
    // Keep the date so logging several buys from one day is quick.
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Portfolio</h1>
          <div className="subtle">Log stock-market investments and see your allocation by ticker</div>
        </div>
      </div>

      <div className="cards">
        <div className="card stat">
          <div className="label">Total Invested</div>
          <div className="value green">{fmt(total)}</div>
        </div>
        <div className="card stat">
          <div className="label">Positions</div>
          <div className="value blue">{slices.length}</div>
        </div>
        <div className="card stat">
          <div className="label">Largest Holding</div>
          <div className="value amber">
            {slices.length > 0 ? `${slices[0].ticker} · ${slices[0].pct.toFixed(0)}%` : "—"}
          </div>
        </div>
      </div>

      <div className="section">
        <div className="card">
          <div className="row-form">
            <div className="field">
              <label>Ticker</label>
              <input
                placeholder="e.g. VOO"
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && add()}
                style={{ textTransform: "uppercase", width: 120 }}
              />
            </div>
            <div className="field amt">
              <label>Amount invested</label>
              <input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <div className="field amt">
              <label>Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
              />
            </div>
            <button className="primary" onClick={add}>
              Log Investment
            </button>
          </div>
        </div>
      </div>

      {slices.length > 0 && (
        <div className="section">
          <div className="card">
            <div className="chart-head">
              <span className="chart-title">Allocation by ticker</span>
              <span className="chart-latest subtle">{fmt(total)} invested</span>
            </div>
            <div className="pie-layout">
              <PieChart slices={slices} hover={hoverTicker} setHover={setHoverTicker} />
              <div className="pie-legend">
                {slices.map((s) => (
                  <div
                    key={s.ticker}
                    className={`pie-legend-row ${hoverTicker && hoverTicker !== s.ticker ? "dim" : ""}`}
                    onMouseEnter={() => setHoverTicker(s.ticker)}
                    onMouseLeave={() => setHoverTicker(null)}
                  >
                    <span className="pie-legend-dot" style={{ background: s.color }} />
                    <span className="pie-legend-ticker">{s.ticker}</span>
                    <span className="subtle">
                      {s.entries} {s.entries === 1 ? "buy" : "buys"}
                    </span>
                    <span className="pie-legend-amt">{fmt(s.total)}</span>
                    <span className="pie-legend-pct">{s.pct.toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <div className="card">
          {investments.length === 0 ? (
            <div className="empty">No investments yet. Log your first buy above.</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ticker</th>
                  <th>Date</th>
                  <th className="num">Amount</th>
                  <th className="actions"></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((inv) =>
                  editingId === inv.id ? (
                    <EditRow
                      key={inv.id}
                      investment={inv}
                      onSave={(updated) => {
                        dispatch({ type: "UPDATE_INVESTMENT", investment: updated });
                        setEditingId(null);
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  ) : (
                    <tr key={inv.id}>
                      <td>
                        <span className="pie-legend-dot" style={{ background: colorOf(inv.ticker) }} />{" "}
                        <strong>{inv.ticker}</strong>
                      </td>
                      <td>{inv.date ?? "—"}</td>
                      <td className="num">{fmt(inv.amount)}</td>
                      <td className="actions">
                        <button className="small" onClick={() => setEditingId(inv.id)}>
                          Edit
                        </button>{" "}
                        <button
                          className="danger small"
                          onClick={() => {
                            if (confirm(`Delete this ${inv.ticker} investment of ${fmt(inv.amount)}?`)) {
                              dispatch({ type: "DELETE_INVESTMENT", id: inv.id });
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

function PieChart({
  slices,
  hover,
  setHover,
}: {
  slices: Slice[];
  hover: string | null;
  setHover: (t: string | null) => void;
}) {
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 96;
  const innerR = 58;

  const hovered = hover ? slices.find((s) => s.ticker === hover) : null;
  const total = slices.reduce((sum, s) => sum + s.total, 0);

  // Build donut segments. A lone slice is a full ring, which arc math can't
  // express, so draw it as a stroked circle instead.
  let angle = -Math.PI / 2; // start at 12 o'clock
  const segments = slices.map((s) => {
    const sweep = total > 0 ? (s.total / total) * Math.PI * 2 : 0;
    const seg = { slice: s, start: angle, end: angle + sweep };
    angle += sweep;
    return seg;
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="pie-svg"
      onMouseLeave={() => setHover(null)}
    >
      {slices.length === 1 ? (
        <circle
          cx={cx}
          cy={cy}
          r={(r + innerR) / 2}
          fill="none"
          stroke={slices[0].color}
          strokeWidth={r - innerR}
          onMouseEnter={() => setHover(slices[0].ticker)}
        />
      ) : (
        segments.map(({ slice, start, end }) => (
          <path
            key={slice.ticker}
            d={donutArc(cx, cy, r, innerR, start, end)}
            fill={slice.color}
            opacity={hover && hover !== slice.ticker ? 0.35 : 1}
            stroke="var(--surface)"
            strokeWidth="2"
            onMouseEnter={() => setHover(slice.ticker)}
          />
        ))
      )}
      <text x={cx} y={cy - 6} textAnchor="middle" className="pie-center-ticker">
        {hovered ? hovered.ticker : "Total"}
      </text>
      <text x={cx} y={cy + 16} textAnchor="middle" className="pie-center-pct">
        {hovered ? `${hovered.pct.toFixed(1)}%` : "100%"}
      </text>
    </svg>
  );
}

/** SVG path for a donut segment from angle a0 to a1 (radians). */
function donutArc(cx: number, cy: number, r: number, ir: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0);
  const y0 = cy + r * Math.sin(a0);
  const x1 = cx + r * Math.cos(a1);
  const y1 = cy + r * Math.sin(a1);
  const ix0 = cx + ir * Math.cos(a1);
  const iy0 = cy + ir * Math.sin(a1);
  const ix1 = cx + ir * Math.cos(a0);
  const iy1 = cy + ir * Math.sin(a0);
  return [
    `M ${x0} ${y0}`,
    `A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`,
    `L ${ix0} ${iy0}`,
    `A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1}`,
    "Z",
  ].join(" ");
}

function EditRow({
  investment,
  onSave,
  onCancel,
}: {
  investment: Investment;
  onSave: (i: Investment) => void;
  onCancel: () => void;
}) {
  const [ticker, setTicker] = useState(investment.ticker);
  const [amount, setAmount] = useState(String(investment.amount));
  const [date, setDate] = useState(investment.date ?? "");

  function save() {
    onSave({
      ...investment,
      ticker: ticker.trim().toUpperCase() || investment.ticker,
      amount: parseFloat(amount) || investment.amount,
      date: date || undefined,
    });
  }

  return (
    <tr>
      <td>
        <input
          value={ticker}
          onChange={(e) => setTicker(e.target.value.toUpperCase())}
          style={{ width: 100, textTransform: "uppercase" }}
        />
      </td>
      <td>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
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
