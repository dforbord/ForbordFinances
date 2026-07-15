import { useEffect, useRef, useState } from "react";
import { fmtShort } from "../format";

export interface MonthlyPoint {
  /** Short x-axis label ("Jun" or "Feb 2026" for the first). */
  label: string;
  /** Full label for the hover tooltip ("June 2026"). */
  fullLabel: string;
  value: number;
  /** The live month — drawn with a hollow, pulsing dot to signal it's still moving. */
  isCurrent: boolean;
}

/**
 * A per-month trend line. Hovering a month reveals a tooltip with that month's value(s);
 * past months are solid (settled), the current month is a hollow "live" dot.
 *
 * Pass `compare` (values index-aligned with `points`) to enable a second, dashed line —
 * used on the income chart to overlay gross (dashed) behind net (solid). When a compare
 * series is present a toggle appears to show/hide it, and per-month numbers move into the
 * hover tooltip (which lists both series) instead of being printed on every dot.
 */
export function MonthlyChart({
  title,
  color,
  points,
  compare,
  primaryLabel = "Net",
  compareLabel = "Gross",
}: {
  title: string;
  color: string;
  points: MonthlyPoint[];
  /** Optional secondary series, drawn as a dashed line under the solid primary. */
  compare?: number[];
  /** Legend/toggle label for the solid primary line. */
  primaryLabel?: string;
  /** Legend/toggle label for the dashed compare line. */
  compareLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(600);
  const [showGross, setShowGross] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(260, entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 172;
  const padX = 34;
  const padTop = 30;
  const padBottom = 26;
  const n = points.length;
  const hasCompare = !!compare && compare.length === n;
  const showingCompare = hasCompare && showGross;

  const values = points.map((p) => p.value);
  const active = showingCompare ? [...values, ...compare!] : values;
  const max = Math.max(1, ...active);
  const min = Math.min(0, ...active);
  const span = max - min || 1;

  const x = (i: number) => padX + (n <= 1 ? 0 : (i * (W - padX * 2)) / (n - 1));
  const y = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom);

  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const areaPts = `${x(0)},${y(min)} ${linePts} ${x(n - 1)},${y(min)}`;
  const comparePts = showingCompare ? compare!.map((v, i) => `${x(i)},${y(v)}`).join(" ") : "";
  const zeroY = y(0);

  const currentIdx = points.findIndex((p) => p.isCurrent);
  const current = currentIdx >= 0 ? points[currentIdx] : undefined;
  const headline = current ? current.value : (points[n - 1]?.value ?? 0);
  const gid = `mgrad-${title.replace(/\W/g, "")}`;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / Math.max(1, r.width)) * W;
    const step = n > 1 ? (W - padX * 2) / (n - 1) : 1;
    const idx = Math.max(0, Math.min(n - 1, Math.round((px - padX) / step)));
    setHover(idx);
  }

  // Tooltip anchor: above the higher of the two lines at the hovered month.
  const tipTop =
    hover == null
      ? 0
      : showingCompare
        ? Math.min(y(points[hover].value), y(compare![hover]))
        : y(points[hover].value);
  const tipLeftPct = hover == null ? 0 : Math.max(12, Math.min(88, (x(hover) / W) * 100));

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-latest" style={{ color }}>
          {fmtShort(headline)}
          {current && <span className="chart-delta subtle"> · this month so far</span>}
        </span>
      </div>
      {hasCompare && (
        <div className="chart-toggle" role="group" aria-label="Income view">
          <button className={!showGross ? "active" : ""} onClick={() => setShowGross(false)}>
            {primaryLabel}
          </button>
          <button className={showGross ? "active" : ""} onClick={() => setShowGross(true)}>
            {compareLabel}
          </button>
        </div>
      )}
      <div className="chart-plot">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          className="chart-svg chart-svg-tall"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {min < 0 && max > 0 && (
            <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} className="chart-zero" />
          )}
          <polygon points={areaPts} fill={`url(#${gid})`} />
          {showingCompare && (
            <>
              <polyline
                points={comparePts}
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeDasharray="5 4"
                opacity="0.8"
              />
              {compare!.map((v, i) => (
                <circle key={`c${i}`} cx={x(i)} cy={y(v)} r={3} fill="var(--surface)" stroke={color} strokeWidth="1.5" opacity="0.8" />
              ))}
            </>
          )}
          <polyline points={linePts} fill="none" stroke={color} strokeWidth={hasCompare ? "2.75" : "2"} />
          {points.map((p, i) => {
            const cx = x(i);
            const cy = y(p.value);
            return p.isCurrent ? (
              <g key={i}>
                <circle cx={cx} cy={cy} r={7} fill="var(--surface)" stroke={color} strokeWidth="2" className="chart-dot-live" />
                <circle cx={cx} cy={cy} r={3} fill={color} />
              </g>
            ) : (
              <circle key={i} cx={cx} cy={cy} r={4} fill={color} />
            );
          })}
          {/* Single-metric charts print each month's value; the income chart moves numbers to hover. */}
          {!hasCompare &&
            points.map((p, i) => (
              <text
                key={`v${i}`}
                x={x(i)}
                y={Math.max(13, y(p.value) - 12)}
                className="chart-vallabel"
                textAnchor="middle"
                fill={color}
              >
                {fmtShort(p.value)}
              </text>
            ))}
          {points.map((p, i) => (
            <text key={`l${i}`} x={x(i)} y={H - 8} className="chart-xlabel" textAnchor="middle">
              {p.label}
            </text>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={padTop - 6} y2={H - padBottom} className="chart-guide" />
              {showingCompare && <circle cx={x(hover)} cy={y(compare![hover])} r={4} fill={color} opacity="0.9" />}
              <circle cx={x(hover)} cy={y(points[hover].value)} r={5} fill={color} stroke="var(--surface)" strokeWidth="2" />
            </g>
          )}
        </svg>
        {hover != null && (
          <div className="chart-tip" style={{ left: `${tipLeftPct}%`, top: tipTop }}>
            <div className="chart-tip-month">
              {points[hover].fullLabel}
              {points[hover].isCurrent ? " · so far" : ""}
            </div>
            {hasCompare ? (
              <>
                {showingCompare && (
                  <div className="chart-tip-row">
                    <span className="chart-tip-swatch dashed" style={{ borderTopColor: color }} />
                    <span className="chart-tip-key">{compareLabel}</span>
                    <b>{fmtShort(compare![hover])}</b>
                  </div>
                )}
                <div className="chart-tip-row">
                  <span className="chart-tip-swatch" style={{ borderTopColor: color }} />
                  <span className="chart-tip-key">{primaryLabel}</span>
                  <b>{fmtShort(points[hover].value)}</b>
                </div>
                {showingCompare && (
                  <div className="chart-tip-sub">Taxes {fmtShort(compare![hover] - points[hover].value)}</div>
                )}
              </>
            ) : (
              <div className="chart-tip-row">
                <b>{fmtShort(points[hover].value)}</b>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
