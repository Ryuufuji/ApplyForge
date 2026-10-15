"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { ClipboardPaste, Link2, Sparkles, Zap } from "lucide-react";
import { SectionHeader } from "@/components/ui";
import { OffersWorkspace } from "@/components/offers-workspace";
import { offers } from "@/lib/mock/offers";
import type { JobOffer } from "@/lib/types";
import { useApp } from "@/lib/store";

/* ============================================================================
   PAGE OFFRES — AI Matcher : catalogue noté + analyse d'une offre collée/URL
   ========================================================================== */

export default function OffresPage() {
  const { profile, toast } = useApp();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState<JobOffer | null>(null);

  const analyze = async () => {
    if (!input.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Le profil master courant (importé du CV le cas échéant) est transmis
        // pour que le scoring serveur reflète la base master de l'utilisateur.
        body: JSON.stringify({ ...(mode === "url" ? { url: input } : { text: input }), profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Analyse impossible");

      const a = json.analysis;
      const title =
        a.extraction?.title ??
        input.split("\n")[0]?.slice(0, 70) ??
        "Offre analysée";
      let company = a.extraction?.company;
      if (!company && json.source === "url") {
        try {
          company = new URL(input).hostname.replace(/^www\./, "");
        } catch {
          company = "Entreprise";
        }
      }
      company = company ?? "Entreprise";

      setCustom({
        id: "custom",
        title,
        company: String(company).replace(/^www\./, ""),
        companySize: "—",
        sector: "Offre personnalisée",
        location: profile.location.split(",")[0],
        remote: a.extraction?.remote ?? "Hybride",
        contract: a.extraction?.contract ?? "CDI",
        salary: a.extraction?.salaryRange ?? "à discuter",
        salaryMin: profile.preferences.salaryMin,
        salaryMax: profile.preferences.salaryMax,
        postedAt: new Date().toISOString(),
        source: json.source === "url" ? "Scraping" : "Collé",
        url: mode === "url" ? input : "",
        tone: "dynamique",
        description: json.preview ?? input.slice(0, 600),
        requirements: a.matchedKeywords,
        keywords: a.matchedKeywords,
      });

      toast({
        title: `Analyse terminée — ${a.score} % d'adéquation`,
        body: `${a.matchedKeywords.length} mots-clés maîtrisés, ${a.missingKeywords.length} à combler.`,
      });
    } catch (err) {
      toast({
        title: "Analyse impossible",
        body: err instanceof Error ? err.message : "Vérifie l'URL ou le texte",
        tone: "warn",
      });
    } finally {
      setBusy(false);
    }
  };

  const hot = offers.filter((o) => o.salaryMax >= 60000).length;

  return (
    <div className="space-y-7">
      <SectionHeader
        index="ai matcher / moteur d'analyse"
        title="Offres & adéquation"
        subtitle="Scoring automatique de chaque offre contre ton profil master : mots-clés, ton de l'entreprise, fourchette salariale et écarts à combler."
        action={
          <div className="flex gap-2">
            <span className="chip">{offers.length} offres indexées</span>
            <span className="chip !border-good/50 !text-good">{hot} à 60k+</span>
          </div>
        }
      />

      {/* Analyseur libre */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-ink">Analyser n&apos;importe quelle offre</p>
            <p className="text-xs text-mute">
              Colle l&apos;URL d&apos;une annonce ou son texte brut — extraction et scoring immédiats.
            </p>
          </div>
          <div className="flex rounded-lg border border-line/60 p-1">
            {(
              [
                ["url", "URL", Link2],
                ["text", "Texte", ClipboardPaste],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  mode === id ? "bg-accent text-accent-contrast" : "text-mute hover:text-ink"
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={mode === "url" ? 1 : 4}
            placeholder={
              mode === "url"
                ? "https://www.transcargo.be/emploi/chard-chargees-receptions-bruxelles-midi"
                : "Colle ici le texte complet d'une offre belge (de: Transcargo, PortLink, GardeLink…)…"
            }
            className="input flex-1 resize-y font-mono text-xs"
          />
          <button type="button" onClick={analyze} disabled={busy || !input.trim()} className="btn btn-primary sm:self-start">
            <Sparkles size={15} /> {busy ? "Analyse…" : "Analyser"}
          </button>
        </div>
        <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-mute">
          astuce : le Quick Grabber (⌘K / Ctrl+K) fait la même chose, sans quitter la page
        </p>
      </motion.div>

      <OffersWorkspace customOffer={custom} />

      <div className="flex items-center gap-3 rounded-xl border border-line/50 bg-elevated/40 p-4 text-xs text-mute">
        <Zap size={15} className="shrink-0 text-accent" />
        Sélectionne une offre puis ouvre l&apos;onglet <span className="text-ink">1-Click Prep</span>{" "}
        pour générer le CV adapté et la lettre, puis <span className="text-ink">Postuler</span> pour
        déclencher l&apos;envoi automatisé.
      </div>
    </div>
  );
}
