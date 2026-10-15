"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarClock, ChevronLeft, ChevronRight, History, MapPin, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Badge, Card, EmptyState, ScoreRing, SectionHeader } from "@/components/ui";
import { PIPELINE, STATUS_META, daysSince, formatRelative, isFollowUpDue } from "@/lib/analytics";
import type { Application, ApplicationStatus } from "@/lib/types";
import { useApp } from "@/lib/store";

const ORDER: ApplicationStatus[] = ["preparation", "postule", "relance", "entretien", "refus", "accepte"];

export default function CandidaturesPage() {
  const { applications, setStatus, removeApplication, toast } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyActive, setOnlyActive] = useState(false);

  const visible = onlyActive
    ? applications.filter((a) => !["refus", "accepte"].includes(a.status))
    : applications;

  const move = (app: Application, dir: 1 | -1) => {
    const idx = ORDER.indexOf(app.status);
    const next = ORDER[Math.max(0, Math.min(ORDER.length - 1, idx + dir))];
    if (next === app.status) return;
    setStatus(app.id, next, `Statut changé → ${STATUS_META[next].label}`);
    toast({ title: `${app.company} → ${STATUS_META[next].label}`, tone: next === "refus" ? "warn" : "ok" });
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        index="pipeline / suivi"
        title="Candidatures"
        subtitle="Toutes tes postulations, leur statut et leur journal horodaté. Les relances passent automatiquement en « Relance » à J+7."
        action={
          <button
            type="button"
            onClick={() => setOnlyActive((v) => !v)}
            className={clsx(
              "btn !py-2 text-xs",
              onlyActive ? "btn-primary" : "btn-ghost"
            )}
          >
            {onlyActive ? "Actives uniquement" : "Toutes les candidatures"}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {ORDER.map((status, colIdx) => {
          const meta = STATUS_META[status];
          const items = visible.filter((a) => a.status === status);
          return (
            <div key={status} className="min-w-0">
              <div className="mb-2.5 flex items-center gap-2 px-1">
                <span className={clsx("h-2 w-2 rounded-full", meta.dot)} />
                <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-mute">
                  {meta.label}
                </span>
                <span className="ml-auto rounded-md bg-elevated/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink">
                  {items.length}
                </span>
              </div>

              <div className="space-y-2.5">
                <AnimatePresence mode="popLayout">
                  {items.map((a, i) => (
                    <motion.div
                      key={a.id}
                      layout
                      initial={{ opacity: 0, y: 14, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.94 }}
                      transition={{ delay: colIdx * 0.03 + i * 0.03, type: "spring", stiffness: 320, damping: 30 }}
                    >
                      <div
                        className={clsx(
                          "panel group cursor-pointer p-3.5 transition-all hover:-translate-y-0.5 hover:border-accent/50",
                          isFollowUpDue(a.followUpAt, a.status) && "border-warn/60"
                        )}
                        onClick={() => setOpenId(openId === a.id ? null : a.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink">{a.company}</p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-mute">
                              {a.title}
                            </p>
                          </div>
                          <ScoreRing score={a.matchScore} size={44} stroke={4} />
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          <Badge>{a.contract}</Badge>
                          {a.appliedAt && (
                            <Badge tone="default">J+{daysSince(a.appliedAt)}</Badge>
                          )}
                          {isFollowUpDue(a.followUpAt, a.status) && (
                            <Badge tone="warn">
                              <CalendarClock size={10} /> relance
                            </Badge>
                          )}
                        </div>

                        {/* Actions rapides */}
                        <div className="mt-2.5 flex items-center justify-between border-t border-line/40 pt-2.5">
                          <button
                            type="button"
                            className="rounded p-1 text-mute opacity-0 transition hover:text-ink group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(a, -1);
                            }}
                            aria-label="Reculer"
                          >
                            <ChevronLeft size={14} />
                          </button>
                          <span className="font-mono text-[10px] text-mute">
                            {formatRelative(a.appliedAt)}
                          </span>
                          <button
                            type="button"
                            className="rounded p-1 text-mute transition hover:text-ink group-hover:opacity-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              move(a, 1);
                            }}
                            aria-label="Avancer"
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>

                        {/* Journal */}
                        <AnimatePresence>
                          {openId === a.id && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="mt-3 space-y-2 border-t border-line/40 pt-3">
                                <p className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-mute">
                                  <History size={11} /> journal
                                </p>
                                {a.events.map((e, idx) => (
                                  <div key={idx} className="flex gap-2 text-[11px]">
                                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                                    <div>
                                      <p className="text-ink/90">{e.note}</p>
                                      <p className="font-mono text-[10px] text-mute">
                                        {new Date(e.at).toLocaleString("fr-FR", {
                                          day: "2-digit",
                                          month: "short",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                    </div>
                                  </div>
                                ))}
                                <p className="flex items-center gap-1.5 pt-1 text-[11px] text-mute">
                                  <MapPin size={11} /> {a.location} · {a.salary}
                                </p>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeApplication(a.id);
                                    toast({ title: "Candidature supprimée", tone: "info" });
                                  }}
                                  className="flex items-center gap-1.5 text-[11px] text-bad hover:underline"
                                >
                                  <Trash2 size={11} /> Supprimer
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {items.length === 0 && (
                  <div className="rounded-lg border border-dashed border-line/60 px-3 py-6 text-center text-[11px] text-mute">
                    Aucune candidature
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {visible.length === 0 && (
        <EmptyState
          title="Pipeline vide"
          body="Colle une offre dans le Quick Grabber (⌘K) pour lancer ta première candidature automatisée."
        />
      )}
    </div>
  );
}
