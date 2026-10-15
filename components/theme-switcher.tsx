"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { useApp } from "@/lib/store";

const SWATCH: Record<string, string[]> = {
  cyberpunk: ["#a855f7", "#22d3ee", "#05060f"],
  slate: ["#e2e8f0", "#60a5fa", "#0f1115"],
  synthwave: ["#ff4f94", "#ffb84d", "#140822"],
  seine: ["#6494c8", "#4a7a9c", "#080a0e"],
};

export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Sélectionner un thème — actuellement ${themes.find((t) => t.id === theme)?.label ?? theme}`}
        onClick={() => setOpen((v) => !v)}
        className={clsx(
          "flex h-9 items-center gap-2 rounded-lg border border-line/60 px-2.5 text-xs text-mute transition-all hover:text-ink",
          open && "border-accent/70 text-ink shadow-glow-soft"
        )}
      >
        <Palette size={15} />
        <span className="hidden font-medium md:inline">
          {themes.find((t) => t.id === theme)?.label}
        </span>
        <span className="flex gap-1">
          {SWATCH[theme].map((c) => (
            <span
              key={c}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-black/30"
              style={{ background: c }}
            />
          ))}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            className="glass absolute right-0 top-11 z-50 w-[264px] overflow-hidden p-1.5"
          >
            <p className="px-2.5 pb-1.5 pt-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-mute">
              Système de thèmes
            </p>
            {themes.map((t) => {
              const active = t.id === theme;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTheme(t.id);
                    setOpen(false);
                  }}
                  className={clsx(
                    "flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition-colors",
                    active ? "bg-elevated ring-1 ring-accent/50" : "hover:bg-elevated/60"
                  )}
                >
                  <span className="flex overflow-hidden rounded-md ring-1 ring-line/70">
                    {SWATCH[t.id].map((c) => (
                      <span key={c} className="h-6 w-3.5" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{t.label}</span>
                    <span className="block truncate text-[11px] text-mute">{t.hint}</span>
                  </span>
                  {active && <Check size={15} className="shrink-0 text-accent" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
