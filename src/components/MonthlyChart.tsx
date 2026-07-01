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
 * A per-month trend line. Each dot is one month's total with its value printed above it;
 * past months are solid (settled), the current month is a hollow "live" dot whose value
 * keeps climbing as new statements are imported.
 */
export function MonthlyChart({
  title,
  color,
  points,
}: {
  title: string;
  color: string;
  points: MonthlyPoint[];
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(600);
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
  const padX = 34; // room so the first/last value labels don't clip
  const padTop = 30; // room for the value labels printed above each dot
  const padBottom = 26;
  const n = points.length;

  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  const x = (i: number) => padX + (n <= 1 ? 0 : (i * (W - padX * 2)) / (n - 1));
  const y = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBottom);

  const linePts = points.map((p, i) => `${x(i)},${y(p.value)}`).join(" ");
  const areaPts = `${x(0)},${y(min)} ${linePts} ${x(n - 1)},${y(min)}`;
  const zeroY = y(0);

  const current = points.find((p) => p.isCurrent);
  const headline = current ? current.value : (points[n - 1]?.value ?? 0);
  const gid = `mgrad-${title.replace(/\W/g, "")}`;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-latest" style={{ color }}>
          {fmtShort(headline)}
          {current && <span className="chart-delta subtle"> · this month so far</span>}
        </span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        className="chart-svg chart-svg-tall"
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
        <polyline points={linePts} fill="none" stroke={color} strokeWidth="2" />
        {points.map((p, i) => {
          const cx = x(i);
          const cy = y(p.value);
          return (
            <g key={i}>
              {p.isCurrent ? (
                <>
                  <circle
                    cx={cx}
                    cy={cy}
                    r={7}
                    fill="var(--surface)"
                    stroke={color}
                    strokeWidth="2"
                    className="chart-dot-live"
                  />
                  <circle cx={cx} cy={cy} r={3} fill={color} />
                </>
              ) : (
                <circle cx={cx} cy={cy} r={4} fill={color} />
              )}
              <text
                x={cx}
                y={Math.max(13, cy - 12)}
                className="chart-vallabel"
                textAnchor="middle"
                fill={color}
              >
                {fmtShort(p.value)}
              </text>
              <title>{`${p.fullLabel}${p.isCurrent ? " (so far)" : ""}: ${fmtShort(p.value)}`}</title>
            </g>
          );
        })}
        {points.map((p, i) => (
          <text key={`l${i}`} x={x(i)} y={H - 8} className="chart-xlabel" textAnchor="middle">
            {p.label}
          </text>
        ))}
      </svg>
    </div>
  );
}
