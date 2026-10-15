"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Link2, Loader2, Sparkles, X, Zap } from "lucide-react";
import { ScoreRing } from "@/components/ui";
import type { Application, MatchAnalysis } from "@/lib/types";
import { useApp } from "@/lib/store";

/* ============================================================================
   QUICK GRABBER — gadget d'injection rapide.
   ⌘K / Ctrl+K (ou clic sur le FAB) → colle une URL ou une offre →
   analyse → préparation → postulation, sans quitter la page courante.
   ========================================================================== */

type Phase = "input" | "analyzing" | "ready" | "sending" | "sent";

export function QuickGrabber() {
  const { addApplication, toast, profile } = useApp();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("input");
  const [raw, setRaw] = useState("");
  const [analysis, setAnalysis] = useState<MatchAnalysis | null>(null);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");

  const reset = useCallback(() => {
    setPhase("input");
    setRaw("");
    setAnalysis(null);
    setTitle("");
    setCompany("");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const analyze = async () => {
    const isUrl = /^https?:\/\//i.test(raw.trim());
    setPhase("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Le profil courant (éventuellement reconstruit depuis le CV master)
        // est transmis pour que le scoring serveur utilise les bonnes données.
        body: JSON.stringify({ ...(isUrl ? { url: raw } : { text: raw }), profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analyse impossible");
      const a: MatchAnalysis = json.analysis;
      setAnalysis(a);
      setTitle(
        a.extraction?.title ?? raw.split("\n")[0].slice(0, 70) ?? "Offre importée"
      );
      let c = a.extraction?.company;
      if (!c && isUrl) {
        try {
          c = new URL(raw).hostname.replace(/^www\./, "");
        } catch {
          c = "Entreprise";
        }
      }
      setCompany(c ?? "Entreprise");
      setPhase("ready");
    } catch (err) {
      toast({ title: "Grabber : échec", body: err instanceof Error ? err.message : "", tone: "warn" });
      setPhase("input");
    }
  };

  const send = async () => {
    if (!analysis) return;
    setPhase("sending");
    await new Promise((r) => setTimeout(r, 1500));

    const now = new Date().toISOString();
    const application: Application = {
      id: `app_${Date.now()}`,
      offerId: `grab_${Date.now()}`,
      title,
      company,
      location: profile.location,
      contract: analysis.extraction?.contract ?? "CDI",
      salary: analysis.extraction?.salaryRange ?? "à discuter",
      matchScore: analysis.score,
      status: "postule",
      appliedAt: now,
      followUpAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      channel: "quick-grabber",
      events: [
        { at: now, status: "postule", note: "Postulation 1-click via Quick Grabber" },
      ],
    };
    addApplication(application);
    setPhase("sent");
    toast({
      title: `Candidature envoyée · ${company}`,
      body: `Adéquation ${analysis.score} % — relance planifiée à J+7.`,
    });
  };

  return (
    <>
      {/* FAB */}
      <motion.button
        id="quick-grabber"
        type="button"
        onClick={() => setOpen(true)}
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.6, type: "spring", stiffness: 300, damping: 20 }}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.95 }}
        className="fixed bottom-5 right-5 z-[65] flex h-14 items-center gap-2.5 rounded-2xl bg-accent-gradient px-4 font-display text-sm font-bold text-accent-contrast shadow-glow"
        aria-label="Ouvrir le Quick Grabber"
      >
        <Zap size={18} strokeWidth={2.6} />
        <span className="hidden sm:inline">Quick Grabber</span>
        <kbd className="hidden rounded border border-black/20 px-1.5 py-0.5 font-mono text-[10px] opacity-80 sm:inline">
          ⌘K
        </kbd>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[75] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
            onClick={() => {
              setOpen(false);
              setTimeout(reset, 250);
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: -24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -18, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="glass w-full max-w-xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-line/50 px-5 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-gradient">
                    <Zap size={14} className="text-accent-contrast" />
                  </span>
                  <div>
                    <p className="font-display text-sm font-bold text-ink">Quick Grabber</p>
                    <p className="font-mono text-[10px] uppercase tracking-widest text-mute">
                      lien ou texte → candidature
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setTimeout(reset, 250);
                  }}
                  className="rounded-lg p-1.5 text-mute transition hover:bg-elevated hover:text-ink"
                  aria-label="Fermer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div className="p-5">
                {phase === "input" && (
                  <>
                    <div className="flex items-center gap-2 text-xs text-mute">
                      <Link2 size={13} className="text-accent" />
                      Colle une URL d&apos;annonce ou le texte brut de l&apos;offre.
                    </div>
                    <textarea
                      autoFocus
                      rows={6}
                      value={raw}
                      onChange={(e) => setRaw(e.target.value)}
                      placeholder={
                        "https://www.cargoflow.be/emploi/chard-chargees-receptions-bruxelles-midi\n— ou —\nTranscargo Terminals recrute un·e Chargé·e de gestion des réceptions en logistique à Bruxelles-Midi…"
                      }
                      className="input mt-3 resize-y font-mono text-xs"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="text-[11px] text-mute">
                        Profil utilisé : <span className="text-ink">{profile.headline}</span>
                      </p>
                      <button
                        type="button"
                        onClick={analyze}
                        disabled={!raw.trim()}
                        className="btn btn-primary"
                      >
                        <Sparkles size={15} /> Analyser
                      </button>
                    </div>
                  </>
                )}

                {phase === "analyzing" && (
                  <div className="grid place-items-center py-10 text-center">
                    <Loader2 size={26} className="animate-spin text-accent" />
                    <p className="mt-3 font-display font-bold text-ink">Extraction & scoring…</p>
                    <p className="mt-1 text-xs text-mute">
                      mots-clés · ton · contrat · adéquation profil
                    </p>
                  </div>
                )}

                {phase === "ready" && analysis && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 rounded-xl border border-line/50 bg-elevated/40 p-4">
                      <ScoreRing score={analysis.score} size={78} label="match" />
                      <div className="min-w-0">
                        <p className="truncate font-display text-sm font-bold text-ink">{title}</p>
                        <p className="truncate text-xs text-mute">{company}</p>
                        <p className="mt-1.5 text-xs leading-relaxed text-mute">{analysis.verdict}</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {analysis.matchedKeywords.slice(0, 6).map((k) => (
                        <span key={k} className="rounded-md bg-good/12 px-2 py-1 font-mono text-[10px] text-good">
                          {k}
                        </span>
                      ))}
                      {analysis.missingKeywords.slice(0, 3).map((k) => (
                        <span key={k} className="rounded-md bg-warn/12 px-2 py-1 font-mono text-[10px] text-warn">
                          {k}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2.5">
                      <button type="button" onClick={send} className="btn btn-primary flex-1">
                        <Zap size={15} /> Générer + Postuler en 1 clic
                      </button>
                      <button type="button" onClick={reset} className="btn btn-ghost">
                        Annuler
                      </button>
                    </div>
                  </div>
                )}

                {phase === "sending" && (
                  <div className="grid place-items-center py-10 text-center">
                    <Loader2 size={26} className="animate-spin text-accent" />
                    <p className="mt-3 font-display font-bold text-ink">Préparation & envoi…</p>
                    <ul className="mt-3 space-y-1 font-mono text-[11px] text-mute">
                      {["CV adapté", "Lettre personnalisée", "Formulaire pré-rempli", "Enregistrement pipeline"].map(
                        (s, i) => (
                          <motion.li
                            key={s}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.32 }}
                          >
                            <span className="text-accent">▸</span> {s}
                          </motion.li>
                        )
                      )}
                    </ul>
                  </div>
                )}

                {phase === "sent" && analysis && (
                  <div className="grid place-items-center py-8 text-center">
                    <span className="grid h-14 w-14 place-items-center rounded-2xl bg-good/15 text-good">
                      <Check size={28} />
                    </span>
                    <p className="mt-3 font-display text-lg font-bold text-ink">Candidature envoyée</p>
                    <p className="mt-1 max-w-sm text-xs text-mute">
                      {company} a reçu ta candidature ({analysis.score} % d&apos;adéquation). La
                      relance J+7 est programmée automatiquement.
                    </p>
                    <div className="mt-4 flex gap-2.5">
                      <a href="/candidatures" className="btn btn-primary">
                        Voir le pipeline
                      </a>
                      <button type="button" onClick={reset} className="btn btn-ghost">
                        Grabber une autre offre
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
