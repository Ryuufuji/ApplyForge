"use client";

import { motion } from "framer-motion";
import clsx from "clsx";

/* ============================================================================
   GRAPHIQUES SVG — 100 % maison, animés, sans dépendance de charting.
   ========================================================================== */

type Bucket = { label: string; sent: number; replies: number; interviews: number };

/** Area chart + barres : activité de candidature. */
export function ActivityChart({ data, height = 210 }: { data: Bucket[]; height?: number }) {
  const w = 720;
  const h = height;
  const pad = { t: 14, r: 8, b: 26, l: 28 };
  const max = Math.max(4, ...data.map((d) => d.sent));
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  const step = innerW / Math.max(1, data.length);

  const x = (i: number) => pad.l + i * step + step / 2;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  const line = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(d.sent).toFixed(1)}`)
    .join(" ");
  const area = `${line} L ${x(data.length - 1)} ${pad.t + innerH} L ${x(0)} ${pad.t + innerH} Z`;

  const ticks = [0, Math.ceil(max / 2), max];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }} role="img" aria-label="Activité des candidatures">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-accent))" stopOpacity="0.42" />
          <stop offset="100%" stopColor="rgb(var(--c-accent))" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(var(--c-alt))" stopOpacity="0.9" />
          <stop offset="100%" stopColor="rgb(var(--c-alt))" stopOpacity="0.25" />
        </linearGradient>
      </defs>

      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.l}
            x2={w - pad.r}
            y1={y(t)}
            y2={y(t)}
            stroke="rgb(var(--c-line))"
            strokeDasharray="3 5"
            opacity={0.6}
          />
          <text x={4} y={y(t) + 3.5} fontSize="9" fill="rgb(var(--c-mute))" fontFamily="var(--font-mono)">
            {t}
          </text>
        </g>
      ))}

      {/* Réponses (barres) */}
      {data.map((d, i) =>
        d.replies > 0 ? (
          <motion.rect
            key={`r-${i}`}
            x={x(i) - step * 0.22}
            width={step * 0.44}
            y={y(d.replies)}
            height={Math.max(2, pad.t + innerH - y(d.replies))}
            rx="2"
            fill="url(#barFill)"
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            style={{ transformOrigin: `0 ${pad.t + innerH}px` }}
            transition={{ delay: 0.4 + i * 0.015, duration: 0.5 }}
          />
        ) : null
      )}

      {/* Area envoyées */}
      <motion.path
        d={area}
        fill="url(#areaFill)"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.5 }}
      />
      <motion.path
        d={line}
        fill="none"
        stroke="rgb(var(--c-accent))"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
      />
      {data.map((d, i) => (
        <motion.circle
          key={`c-${i}`}
          cx={x(i)}
          cy={y(d.sent)}
          r="2.6"
          fill="rgb(var(--c-base))"
          stroke="rgb(var(--c-accent))"
          strokeWidth="1.6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 + i * 0.02 }}
        />
      ))}

      {data.map((d, i) =>
        i % 3 === 0 ? (
          <text
            key={`l-${i}`}
            x={x(i)}
            y={h - 8}
            fontSize="9"
            textAnchor="middle"
            fill="rgb(var(--c-mute))"
            fontFamily="var(--font-mono)"
          >
            {d.label}
          </text>
        ) : null
      )}
    </svg>
  );
}

/** Donut : répartition du pipeline. */
export function DonutChart({
  data,
  size = 168,
  thickness = 16,
  centerLabel,
  centerValue,
}: {
  data: { name: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90 shrink-0">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgb(var(--c-line))"
          strokeWidth={thickness}
          opacity={0.45}
        />
        {data.map((d, i) => {
          const frac = d.value / total;
          const len = frac * c;
          const seg = (
            <motion.circle
              key={d.name}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={thickness}
              strokeLinecap="butt"
              strokeDasharray={`${Math.max(0, len - 3)} ${c - Math.max(0, len - 3)}`}
              strokeDashoffset={-offset}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 * i, duration: 0.5, ease: "easeOut" }}
              style={{ transformOrigin: "center" }}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="min-w-0">
        {centerValue && (
          <p className="font-display text-3xl font-bold leading-none text-ink">{centerValue}</p>
        )}
        {centerLabel && <p className="mt-1 text-xs uppercase tracking-wider text-mute">{centerLabel}</p>}
        <ul className="mt-3 space-y-1.5">
          {data.map((d) => (
            <li key={d.name} className="flex items-center gap-2 text-xs">
              <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
              <span className="text-mute">{d.name}</span>
              <span className="ml-auto font-mono font-semibold text-ink">{d.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Barres horizontales : top secteurs / mots-clés. */
export function BarList({
  data,
  max: forcedMax,
}: {
  data: { name: string; value: number; hint?: string }[];
  max?: number;
}) {
  const max = forcedMax ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-3">
      {data.map((d, i) => (
        <li key={d.name}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-sm text-ink">{d.name}</span>
            <span className="font-mono text-xs font-semibold text-mute">
              {d.hint ?? `${d.value}`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-line/40">
            <motion.div
              initial={{ width: 0 }}
              whileInView={{ width: `${(d.value / max) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
              className={clsx("h-full rounded-full bg-accent-gradient")}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Sparkline miniature. */
export function Sparkline({ points, className }: { points: number[]; className?: string }) {
  const w = 120;
  const h = 34;
  const max = Math.max(...points, 1);
  const step = w / Math.max(1, points.length - 1);
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${i * step} ${h - (p / max) * (h - 4) - 2}`)
    .join(" ");
  return (
    <svg width={w} height={h} className={className} viewBox={`0 0 ${w} ${h}`}>
      <motion.path
        d={d}
        fill="none"
        stroke="rgb(var(--c-accent))"
        strokeWidth="2"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />
    </svg>
  );
}
