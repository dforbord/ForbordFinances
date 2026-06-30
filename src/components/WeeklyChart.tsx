import { useEffect, useRef, useState } from "react";
import { fmtShort } from "../format";

interface Point {
  label: string;
  value: number;
}

export function WeeklyChart({
  title,
  color,
  points,
}: {
  title: string;
  color: string;
  points: Point[];
}) {
  // Render at the card's real pixel width (1:1) so nothing stretches — the
  // points simply spread out to fill a wider card, dots stay round.
  const svgRef = useRef<SVGSVGElement>(null);
  const [W, setW] = useState(600);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      setW(Math.max(220, entries[0].contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 150;
  const padX = 14;
  const padTop = 16;
  const padBottom = 24;
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

  const latest = points[n - 1]?.value ?? 0;
  const prev = points[n - 2]?.value ?? 0;
  const delta = latest - prev;
  const gid = `grad-${title.replace(/\W/g, "")}`;

  return (
    <div className="card chart-card">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-latest" style={{ color }}>
          {fmtShort(latest)}
          {n > 1 && (
            <span className="chart-delta subtle">
              {" "}
              {delta >= 0 ? "▲" : "▼"} {fmtShort(Math.abs(delta))}
            </span>
          )}
        </span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="chart-svg">
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
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.value)} r={i === n - 1 ? 4 : 2.5} fill={color}>
            <title>{`Week of ${p.label}: ${fmtShort(p.value)}`}</title>
          </circle>
        ))}
        {points.map((p, i) =>
          i % 2 === 0 || i === n - 1 ? (
            <text key={`l${i}`} x={x(i)} y={H - 7} className="chart-xlabel" textAnchor="middle">
              {p.label}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}
