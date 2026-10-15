"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarClock,
  Check,
  Clock,
  Copy,
  Mail,
  Send,
  Sparkles,
  TimerReset,
} from "lucide-react";
import clsx from "clsx";
import { Badge, Card, Counter, EmptyState, ScoreRing, SectionHeader } from "@/components/ui";
import { buildFollowUpEmail } from "@/lib/ai/generator";
import { daysSince, daysUntil, formatRelative, isFollowUpDue } from "@/lib/analytics";
import type { Application, JobOffer, Profile } from "@/lib/types";
import { useApp } from "@/lib/store";

/* ============================================================================
   MODULE DE RELANCE AUTOMATIQUE — J+7 personnalisé.
   Chaque candidature sans retour déclenche un brouillon rédigé, prêt à envoyer.
   ========================================================================== */

function offerFromApplication(app: Application, profile: Profile): JobOffer {
  return {
    id: app.offerId,
    title: app.title,
    company: app.company,
    companySize: "—",
    sector: "—",
    location: app.location.split(" · ")[0],
    remote: (app.location.split(" · ")[1] as JobOffer["remote"]) ?? "Hybride",
    contract: app.contract,
    salary: app.salary,
    salaryMin: profile.preferences.salaryMin,
    salaryMax: profile.preferences.salaryMax,
    postedAt: app.appliedAt ?? new Date().toISOString(),
    source: app.channel,
    url: "",
    tone: "corporate",
    description: app.title,
    requirements: [],
    keywords: [],
  };
}

export default function RelancesPage() {
  const { applications, profile, setStatus, toast } = useApp();
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { due, upcoming, sent } = useMemo(() => {
    const pending = applications.filter(
      (a) => !["refus", "accepte"].includes(a.status) && a.followUpAt
    );
    return {
      due: pending.filter((a) => isFollowUpDue(a.followUpAt, a.status)),
      upcoming: pending
        .filter((a) => !isFollowUpDue(a.followUpAt, a.status))
        .sort((a, b) => (a.followUpAt ?? "").localeCompare(b.followUpAt ?? "")),
      sent: applications
        .flatMap((a) =>
          a.events
            .filter((e) => e.status === "relance")
            .map((e) => ({ app: a, at: e.at, note: e.note }))
        )
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  }, [applications]);

  const draft = applications.find((a) => a.id === draftFor);
  const draftText = draft
    ? buildFollowUpEmail(profile, offerFromApplication(draft, profile), {
        appliedAt: draft.appliedAt,
        matchScore: draft.matchScore,
      })
    : "";

  const sendRelance = (app: Application) => {
    setStatus(app.id, "relance", `Relance J+7 personnalisée envoyée à ${app.company}`);
    setDraftFor(null);
    toast({
      title: `Relance envoyée à ${app.company}`,
      body: "Prochaine relance programmée à J+14 si toujours sans retour.",
    });
  };

  const postpone = (app: Application) => {
    setStatus(app.id, "postule", "Relance reportée de 7 jours");
    toast({ title: "Relance reportée", body: `Nouvelle échéance dans 7 jours.`, tone: "info" });
  };

  return (
    <div className="space-y-7">
      <SectionHeader
        index="relance auto / j+7"
        title="Relances automatiques"
        subtitle="Un email personnalisé est préparé 7 jours après l'envoi pour chaque entreprise sans retour — avec le contexte de la candidature."
        action={
          <div className="flex gap-2">
            <span className="chip !border-warn/50 !text-warn">
              <TimerReset size={11} /> {due.length} à envoyer
            </span>
            <span className="chip">{upcoming.length} à venir</span>
          </div>
        }
      />

      {/* Résumé */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Relances dues", value: due.length, tone: "text-warn" },
          { label: "Programmées", value: upcoming.length, tone: "text-accent" },
          { label: "Déjà envoyées", value: sent.length, tone: "text-good" },
          { label: "Taux de retour global", value: 24, suffix: "%", tone: "text-alt" },
        ].map((s, i) => (
          <Card key={s.label} delay={i * 0.06} className="p-4">
            <p className="text-[11px] uppercase tracking-wider text-mute">{s.label}</p>
            <p className={clsx("mt-1.5 font-display text-3xl font-bold", s.tone)}>
              <Counter to={s.value} suffix={s.suffix ?? ""} />
            </p>
          </Card>
        ))}
      </div>

      {/* À envoyer */}
      <section>
        <h3 className="mb-3 font-display text-lg font-bold text-ink">
          À traiter <span className="text-warn">({due.length})</span>
        </h3>
        {due.length === 0 ? (
          <EmptyState
            title="Aucune relance due"
            body="Toutes les candidatures en attente sont encore dans leur fenêtre de patience (J+7)."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {due.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
              >
                <Card hover className="p-4">
                  <div className="flex items-start gap-3">
                    <ScoreRing score={a.matchScore} size={56} stroke={5} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-display text-sm font-bold text-ink">{a.company}</p>
                        <Badge tone="warn">
                          <CalendarClock size={10} /> {formatRelative(a.followUpAt)}
                        </Badge>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-mute">{a.title}</p>
                      <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-mute">
                        envoyée il y a {daysSince(a.appliedAt)} jours · {a.channel}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => sendRelance(a)} className="btn btn-primary !py-2 !text-xs">
                      <Send size={13} /> Envoyer la relance
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraftFor(draftFor === a.id ? null : a.id)}
                      className="btn btn-ghost !py-2 !text-xs"
                    >
                      <Sparkles size={13} /> {draftFor === a.id ? "Fermer" : "Voir le brouillon"}
                    </button>
                    <button type="button" onClick={() => postpone(a)} className="btn btn-ghost !py-2 !text-xs">
                      <Clock size={13} /> +7 jours
                    </button>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* Programmées */}
      <section>
        <h3 className="mb-3 font-display text-lg font-bold text-ink">
          Programmées <span className="text-accent">({upcoming.length})</span>
        </h3>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {upcoming.map((a) => (
            <div key={a.id} className="panel flex items-center gap-3 p-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/12 text-accent ring-1 ring-accent/30">
                <Mail size={15} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{a.company}</p>
                <p className="truncate text-[11px] text-mute">{a.title}</p>
              </div>
              <span className="shrink-0 font-mono text-[11px] font-bold text-accent">
                J+{Math.max(0, -daysUntil(a.followUpAt) + 7)}
              </span>
            </div>
          ))}
          {upcoming.length === 0 && (
            <p className="text-sm text-mute">Aucune relance programmée.</p>
          )}
        </div>
      </section>

      {/* Historique */}
      <section>
        <h3 className="mb-3 font-display text-lg font-bold text-ink">Historique des relances</h3>
        <Card className="divide-y divide-line/40">
          {sent.slice(0, 8).map((s, i) => (
            <div key={`${s.app.id}-${i}`} className="flex items-center gap-3 px-4 py-3">
              <Check size={14} className="shrink-0 text-good" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-ink">
                  {s.app.company} — {s.note}
                </p>
                <p className="font-mono text-[10px] text-mute">
                  {new Date(s.at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "long",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDraftFor(s.app.id)}
                className="rounded p-1.5 text-mute transition hover:bg-elevated hover:text-ink"
                aria-label="Copier"
              >
                <Copy size={13} />
              </button>
            </div>
          ))}
          {sent.length === 0 && <p className="px-4 py-5 text-sm text-mute">Pas encore de relance envoyée.</p>}
        </Card>
      </section>

      <AnimatePresence>
        {draft && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] grid place-items-center bg-black/60 p-4 backdrop-blur-sm"
            onClick={() => setDraftFor(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="glass max-h-[80vh] w-full max-w-2xl overflow-auto p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="font-display text-base font-bold text-ink">
                    Brouillon de relance — {draft.company}
                  </p>
                  <p className="text-xs text-mute">Personnalisé à partir de la candidature</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(draftText);
                    toast({ title: "Brouillon copié", tone: "info" });
                  }}
                  className="btn btn-ghost !py-1.5 !text-xs"
                >
                  <Copy size={13} /> Copier
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-ink/90">
                {draftText}
              </pre>
              <div className="mt-4 flex gap-2.5">
                <button type="button" onClick={() => sendRelance(draft)} className="btn btn-primary">
                  <Send size={15} /> Envoyer maintenant
                </button>
                <button type="button" onClick={() => setDraftFor(null)} className="btn btn-ghost">
                  Fermer
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
