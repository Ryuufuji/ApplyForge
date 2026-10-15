"use client";

import clsx from "clsx";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

/* ============================================================================
   PRIMITIVES UI — cartes, compteurs animés, anneaux de score, en-têtes
   ========================================================================== */

export function Card({
  children,
  className,
  hover = false,
  delay = 0,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  delay?: number;
  onClick?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      onClick={onClick}
      className={clsx(
        "panel relative overflow-hidden",
        hover &&
          "transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-glow-soft",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

/** Compteur animé (framer-motion), respecte prefers-reduced-motion. */
export function Counter({
  to,
  suffix = "",
  prefix = "",
  decimals = 0,
  duration = 1.1,
}: {
  to: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
  duration?: number;
}) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setValue(to);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setValue(to * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  const display = decimals ? value.toFixed(decimals) : Math.round(value).toString();
  return (
    <span className="tabular-nums">
      {prefix}
      {display}
      {suffix}
    </span>
  );
}

/** Anneau de score (ATS / match %). */
export function ScoreRing({
  score,
  size = 84,
  stroke = 7,
  label,
  className,
}: {
  score: number;
  size?: number;
  stroke?: number;
  label?: string;
  className?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const tone =
    pct >= 85 ? "text-good" : pct >= 65 ? "text-accent" : pct >= 45 ? "text-warn" : "text-bad";

  return (
    <div className={clsx("relative inline-grid place-items-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={`ring-${score}-${size}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="currentColor" className={tone} />
            <stop offset="100%" stopColor="rgb(var(--c-alt))" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke="rgb(var(--c-line))"
          opacity={0.6}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={`url(#ring-${score}-${size})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c - (pct / 100) * c }}
          viewport={{ once: true }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className={clsx("font-display font-bold", tone)} style={{ fontSize: size / 3.4 }}>
          {Math.round(pct)}
        </span>
        {label && <span className="mt-0.5 text-[9px] uppercase tracking-wider text-mute">{label}</span>}
      </span>
    </div>
  );
}

/** En-tête de section avec index numérique (look technique). */
export function SectionHeader({
  index,
  title,
  subtitle,
  action,
}: {
  index?: string;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {index && (
          <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            {index}
          </p>
        )}
        <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-mute">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Badge({
  children,
  tone = "default",
  className,
}: {
  children: React.ReactNode;
  tone?: "default" | "accent" | "good" | "warn" | "bad" | "alt";
  className?: string;
}) {
  const tones: Record<string, string> = {
    default: "text-mute",
    accent: "text-accent border-accent/50 bg-accent/10",
    good: "text-good border-good/50 bg-good/10",
    warn: "text-warn border-warn/50 bg-warn/10",
    bad: "text-bad border-bad/50 bg-bad/10",
    alt: "text-alt border-alt/50 bg-alt/10",
  };
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Barre de progression fine. */
export function Bar({ value, className, delay = 0 }: { value: number; className?: string; delay?: number }) {
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full bg-line/50", className)}>
      <motion.div
        initial={{ width: 0 }}
        whileInView={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        viewport={{ once: true }}
        transition={{ duration: 1, delay, ease: [0.16, 1, 0.3, 1] }}
        className="h-full rounded-full bg-accent-gradient"
      />
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <motion.span
      style={{ width: size, height: size }}
      className="inline-block rounded-full border-2 border-accent/30 border-t-accent"
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
    />
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed border-line/70 px-6 py-12 text-center">
      <p className="font-display text-base font-semibold text-ink">{title}</p>
      <p className="mt-1 max-w-md text-sm text-mute">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
