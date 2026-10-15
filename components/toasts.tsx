"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { useApp } from "@/lib/store";

export function Toasts() {
  const { toasts } = useApp();

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[70] flex w-[min(360px,calc(100vw-2.5rem))] flex-col gap-2.5">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => {
          const Icon =
            t.tone === "warn" ? TriangleAlert : t.tone === "info" ? Info : CheckCircle2;
          const color =
            t.tone === "warn" ? "text-warn" : t.tone === "info" ? "text-alt" : "text-good";
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="glass pointer-events-auto flex items-start gap-3 p-3.5"
            >
              <Icon size={17} className={`mt-0.5 shrink-0 ${color}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-ink">{t.title}</p>
                {t.body && <p className="mt-0.5 text-xs leading-relaxed text-mute">{t.body}</p>}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
