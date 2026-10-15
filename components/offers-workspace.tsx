"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clipboard,
  Copy,
  ExternalLink,
  FileText,
  Mail,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import clsx from "clsx";
import { Badge, Card, ScoreRing, SectionHeader, Spinner } from "@/components/ui";
import { analyzeOffer } from "@/lib/ai/matcher";
import { offers as catalog } from "@/lib/mock/offers";
import type { Application, GeneratedAssets, JobOffer, MatchAnalysis } from "@/lib/types";
import { useApp } from "@/lib/store";

type Tab = "analyse" | "prep" | "envoi";

const TONE_LABEL: Record<JobOffer["tone"], string> = {
  corporate: "Corporate / structuré",
  startup: "Startup / direct",
  technique: "Technique / précis",
  creative: "Créatif / visuel",
  dynamique: "Dynamique / ambitieux",
};

/* ==========================================================================
   WORKSPACE : liste + panneau Analyse / 1-Click Prep / Envoi 1-clic
   ========================================================================== */

export function OffersWorkspace({ customOffer }: { customOffer?: JobOffer | null }) {
  const [selectedId, setSelectedId] = useState<string>(customOffer?.id ?? catalog[0].id);
  const [filter, setFilter] = useState<"all" | "hot" | "remote" | "sector" | "location" | "contract">("all");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  const [countryFilter, setCountryFilter] = useState<string>("all");
  const [contractFilter, setContractFilter] = useState<string>("all");

  const getCity = (location: string) => {
    const parts = location.split(",");
    return parts[0].trim();
  };
  const getCountry = (location: string) => {
    const parts = location.split(",");
    return parts.length > 1 ? parts[parts.length - 1].trim() : "Belgique";
  };
  const { applications, profile } = useApp();

  const pool = useMemo(
    () => (customOffer ? [customOffer, ...catalog] : catalog),
    [customOffer]
  );
  const selected = pool.find((o) => o.id === selectedId) ?? pool[0];

  // Le profil vient du store : il reflète le CV master importé.
  const analysis = useMemo(() => analyzeOffer(selected, profile), [selected, profile]);

  const scored = useMemo(
    () => pool.map((o) => ({ offer: o, score: analyzeOffer(o, profile).score })),
    [pool, profile]
  );

  const visible = scored
    .filter(({ offer, score }) => {
      if (filter === "hot") return score >= 80;
      if (filter === "remote") return offer.remote !== "Sur site";
      if (filter === "sector") return sectorFilter === "all" || offer.sector === sectorFilter;
      if (filter === "location") {
        if (countryFilter !== "all") {
          return getCountry(offer.location) === countryFilter;
        }
        return locationFilter === "all" || getCity(offer.location) === locationFilter;
      }
      if (filter === "contract") return contractFilter === "all" || offer.contract === contractFilter;
      return true;
    })
    .sort((a, b) => b.score - a.score);

  const alreadyApplied = applications.find((a) => a.offerId === selected.id);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* ------------------------------------------------ LISTE */}
      <div className="space-y-3">
        <div className="flex gap-1.5 flex-wrap">
          {(
            [
              ["all", "Toutes"],
              ["hot", "Match ≥ 80"],
              ["remote", "Hybride/Remote"],
              ["sector", "Secteur"],
              ["location", "Localisation"],
              ["contract", "Contrat"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setFilter(id);
                if (id === "sector") setSectorFilter("all");
                if (id === "location") setLocationFilter("all");
                if (id === "contract") setContractFilter("all");
              }}
              className={clsx(
                "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                filter === id
                  ? "border-accent/60 bg-accent/12 text-accent"
                  : "border-line/60 text-mute hover:text-ink"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {/* Filtres secondaires */}
        {filter === "sector" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setSectorFilter("all")}
              className={clsx(
                "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                sectorFilter === "all"
                  ? "border-accent/60 bg-accent/12 text-accent"
                  : "border-line/60 text-mute hover:text-ink"
              )}
            >
              Tous secteurs
            </button>
            {Array.from(new Set(catalog.map((o) => o.sector))).map((sector) => (
              <button
                key={sector}
                type="button"
                onClick={() => setSectorFilter(sector)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                  sectorFilter === sector
                    ? "border-accent/60 bg-accent/12 text-accent"
                    : "border-line/60 text-mute hover:text-ink"
                )}
              >
                {sector}
              </button>
            ))}
          </div>
        )}
        {filter === "location" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => { setCountryFilter("all"); setLocationFilter("all"); }}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                  countryFilter === "all" && locationFilter === "all"
                    ? "border-accent/60 bg-accent/12 text-accent"
                    : "border-line/60 text-mute hover:text-ink"
                )}
              >
                Tout
              </button>
              {Array.from(new Set(catalog.map((o) => getCountry(o.location)))).map((country) => (
                <button
                  key={country}
                  type="button"
                  onClick={() => { setCountryFilter(country); setLocationFilter("all"); }}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                    countryFilter === country && locationFilter === "all"
                      ? "border-accent/60 bg-accent/12 text-accent"
                      : "border-line/60 text-mute hover:text-ink"
                  )}
                >
                  {country}
                </button>
              ))}
            </div>
            {countryFilter !== "all" && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setLocationFilter("all")}
                  className={clsx(
                    "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                    locationFilter === "all"
                      ? "border-accent/60 bg-accent/12 text-accent"
                      : "border-line/60 text-mute hover:text-ink"
                  )}
                >
                  Toutes villes
                </button>
                {Array.from(new Set(catalog.map((offer) => getCity(offer.location)).filter((city) => {
                  const offerForCountry = catalog.find((o) => getCity(o.location) === city);
                  return offerForCountry ? getCountry(offerForCountry.location) === countryFilter : false;
                }))).map((city) => (
                  <button
                    key={city}
                    type="button"
                    onClick={() => setLocationFilter(city)}
                    className={clsx(
                      "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                      locationFilter === city
                        ? "border-accent/60 bg-accent/12 text-accent"
                        : "border-line/60 text-mute hover:text-ink"
                    )}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {filter === "contract" && (
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <button
              type="button"
              onClick={() => setContractFilter("all")}
              className={clsx(
                "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                contractFilter === "all"
                  ? "border-accent/60 bg-accent/12 text-accent"
                  : "border-line/60 text-mute hover:text-ink"
              )}
            >
              Tous contrats
            </button>
            {Array.from(new Set(catalog.map((o) => o.contract))).map((contract) => (
              <button
                key={contract}
                type="button"
                onClick={() => setContractFilter(contract)}
                className={clsx(
                  "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition",
                  contractFilter === contract
                    ? "border-accent/60 bg-accent/12 text-accent"
                    : "border-line/60 text-mute hover:text-ink"
                )}
              >
                {contract}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto pr-1">
          {visible.map(({ offer, score }, i) => {
            const active = offer.id === selected.id;
            const applied = applications.find((a) => a.offerId === offer.id);
            return (
              <motion.button
                key={offer.id}
                type="button"
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
                onClick={() => setSelectedId(offer.id)}
                className={clsx(
                  "w-full rounded-xl border p-3.5 text-left transition-all duration-200",
                  active
                    ? "border-accent/70 bg-elevated/70 shadow-glow-soft"
                    : "border-line/50 bg-surface/50 hover:border-accent/40 hover:bg-elevated/40"
                )}
              >
                <div className="flex items-start gap-3">
                  <ScoreRing score={score} size={46} stroke={4.5} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{offer.title}</p>
                    <p className="truncate text-xs text-mute">
                      {offer.company} · {offer.location} · {offer.contract}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      <Badge tone="accent">{offer.remote}</Badge>
                      <Badge>{offer.salary}</Badge>
                      {applied && <Badge tone="good">{applied.status === "preparation" ? "Préparée" : "Envoyée"}</Badge>}
                    </div>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------ PANNEAU */}
      <div className="min-w-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <OfferPanel
              offer={selected}
              analysis={analysis}
              appliedStatus={alreadyApplied?.status ?? null}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ==========================================================================
   PANNEAU DÉTAILLÉ
   ========================================================================== */

function OfferPanel({
  offer,
  analysis,
  appliedStatus,
}: {
  offer: JobOffer;
  analysis: MatchAnalysis;
  appliedStatus: Application["status"] | null;
}) {
  const [tab, setTab] = useState<Tab>("analyse");

  const tabs: { id: Tab; label: string; icon: typeof Zap }[] = [
    { id: "analyse", label: "Analyse IA", icon: Sparkles },
    { id: "prep", label: "1-Click Prep", icon: FileText },
    { id: "envoi", label: "Postuler", icon: Zap },
  ];

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="relative border-b border-line/50 p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{offer.sector}</Badge>
              <Badge>{offer.contract}</Badge>
              <Badge>{offer.remote}</Badge>
              <Badge>{offer.source}</Badge>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold leading-tight text-ink">
              {offer.title}
            </h2>
            <p className="mt-1 text-sm text-mute">
              {offer.company} ({offer.companySize}) · {offer.location} ·{" "}
              <span className="text-ink">{offer.salary}</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {offer.keywords.slice(0, 7).map((k) => (
                <span
                  key={k}
                  className={clsx(
                    "rounded-md border px-2 py-0.5 font-mono text-[10px]",
                    analysis.matchedKeywords.some(
                      (m) => m.toLowerCase() === k.toLowerCase()
                    )
                      ? "border-good/50 bg-good/10 text-good"
                      : "border-line/60 text-mute"
                  )}
                >
                  {k}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col items-center gap-1">
            <ScoreRing score={analysis.score} size={104} label="adéquation" />
            <a href={offer.url} target="_blank" rel="noreferrer" className="mt-1 text-[11px] text-mute hover:text-accent">
              Voir l'offre <ExternalLink size={10} className="inline" />
            </a>
          </div>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 border-b border-line/50 px-3 pt-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={clsx(
              "relative flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold transition",
              tab === id ? "text-ink" : "text-mute hover:text-ink"
            )}
          >
            <Icon size={15} />
            {label}
            {tab === id && (
              <motion.span
                layoutId="offer-tab"
                className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-accent-gradient"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        ))}
      </div>

      <div className="p-5 sm:p-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
          >
            {tab === "analyse" && <AnalyseTab offer={offer} analysis={analysis} onPrep={() => setTab("prep")} />}
            {tab === "prep" && <PrepTab offer={offer} analysis={analysis} onSent={() => setTab("envoi")} />}
            {tab === "envoi" && (
              <ApplyTab offer={offer} analysis={analysis} status={appliedStatus} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Card>
  );
}

/* ========================================================================== TAB 1 */
function AnalyseTab({
  offer,
  analysis,
  onPrep,
}: {
  offer: JobOffer;
  analysis: MatchAnalysis;
  onPrep: () => void;
}) {
  const { profile } = useApp();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line/50 bg-elevated/40 p-4">
        <div>
          <p className="font-display text-base font-bold text-ink">{analysis.verdict}</p>
          <p className="mt-0.5 text-xs text-mute">
            {analysis.extraction.wordCount} mots analysés · ton détecté :{" "}
            <span className="text-accent">{TONE_LABEL[offer.tone]}</span>
          </p>
        </div>
        <button type="button" onClick={onPrep} className="btn btn-primary">
          <Sparkles size={15} /> Préparer la candidature
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-line/50 p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-good">
            ✓ Points d'adhésion
          </p>
          <ul className="space-y-2">
            {analysis.strengths.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-ink">
                <Check size={14} className="mt-0.5 shrink-0 text-good" />
                {s}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {analysis.matchedKeywords.length ? (
              analysis.matchedKeywords.map((k) => (
                <span key={k} className="rounded-md bg-good/12 px-2 py-1 font-mono text-[10px] text-good">
                  {k}
                </span>
              ))
            ) : (
              <span className="text-xs text-mute">Aucun mot-clé commun détecté</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-line/50 p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-warn">
            ! Points de vigilance
          </p>
          <ul className="space-y-2">
            {analysis.risks.map((s) => (
              <li key={s} className="flex gap-2 text-sm text-ink">
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warn" />
                {s}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {analysis.missingKeywords.map((k) => (
              <span key={k} className="rounded-md bg-warn/12 px-2 py-1 font-mono text-[10px] text-warn">
                {k}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoCell label="Conseil de ton" value={analysis.toneAdvice} />
        <InfoCell
          label="Fourchette salariale"
          value={`${analysis.extraction.salaryRange ?? offer.salary} — ${analysis.salaryFit}`}
        />
        <InfoCell
          label="Localisation"
          value={
            analysis.locationFit
              ? `Compatible avec ${profile.preferences.locations.slice(0, 2).join(" / ")}`
              : `À vérifier — vous visez ${profile.preferences.locations[0]}`
          }
        />
      </div>

      <div className="rounded-xl border border-line/50 bg-elevated/30 p-4">
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
          Description de l'offre
        </p>
        <p className="text-sm leading-relaxed text-ink/90">{offer.description}</p>
        <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {offer.requirements.map((r) => (
            <li key={r} className="flex gap-2 text-xs text-mute">
              <ArrowRight size={12} className="mt-0.5 shrink-0 text-accent" />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-mute">{label}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">{value}</p>
    </div>
  );
}

/* ========================================================================== TAB 2 */
function PrepTab({
  offer,
  analysis,
  onSent,
}: {
  offer: JobOffer;
  analysis: MatchAnalysis;
  onSent: () => void;
}) {
  const { toast, profile } = useApp();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [assets, setAssets] = useState<GeneratedAssets | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const generate = async () => {
    setState("loading");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        // Le profil courant accompagne la demande : la génération 1-Click
        // s'appuie sur le CV master reconstruit, pas sur la démo.
        body: JSON.stringify({ offerId: offer.id, profile }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Erreur de génération");
      setAssets(json.assets);
      setState("done");
      toast({
        title: "Candidature préparée",
        body: `CV adapté + lettre rédigés (${json.assets.engine === "llm" ? json.assets.model : "moteur local"}).`,
      });
    } catch (err) {
      setState("idle");
      toast({
        title: "Génération impossible",
        body: err instanceof Error ? err.message : "Réessaie",
        tone: "warn",
      });
    }
  };

  const copy = async (key: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    toast({ title: "Copié dans le presse-papier", tone: "info" });
    setTimeout(() => setCopied(null), 1800);
  };

  if (state === "idle") {
    return (
      <div className="grid place-items-center rounded-xl border border-dashed border-accent/40 bg-accent/5 px-6 py-14 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-gradient shadow-glow">
          <Sparkles size={24} className="text-accent-contrast" />
        </span>
        <p className="mt-4 font-display text-lg font-bold text-ink">
          Générer la candidature sur-mesure
        </p>
        <p className="mt-1 max-w-md text-sm text-mute">
          Adapte ton CV aux mots-clés de l&apos;offre, rédige la lettre au ton de l&apos;entreprise et
          prépare la relance J+7 — en une seule passe.
        </p>
        <button type="button" onClick={generate} className="btn btn-primary mt-5">
          <Zap size={15} /> Lancer le 1-Click Prep
        </button>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-mute">
          Score d&apos;adéquation {analysis.score} % · {analysis.matchedKeywords.length} mots-clés ciblés
        </p>
      </div>
    );
  }

  if (state === "loading") {
    return (
      <div className="grid place-items-center rounded-xl border border-line/50 bg-elevated/40 px-6 py-16 text-center">
        <Spinner size={26} />
        <p className="mt-4 font-display font-bold text-ink">Rédaction en cours…</p>
        <ul className="mt-4 space-y-1.5 text-left font-mono text-[11px] text-mute">
          {[
            "Extraction des mots-clés prioritaires",
            "Reclassement des expériences pertinentes",
            "Rédaction de la lettre au ton détecté",
            "Préparation de la relance J+7",
          ].map((s, i) => (
            <motion.li
              key={s}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.45 }}
            >
              <span className="text-accent">▸</span> {s}
            </motion.li>
          ))}
        </ul>
      </div>
    );
  }

  if (!assets) return null;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CV */}
        <div className="rounded-xl border border-line/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              CV · haute-saillies
            </p>
            <button
              type="button"
              onClick={() => copy("cv", assets.cvSummary + "\n\n" + assets.cvHighlights.map((h) => `• ${h.skill} — ${h.proof}`).join("\n"))}
              className="btn btn-ghost !px-2 !py-1 !text-[11px]"
            >
              {copied === "cv" ? <Check size={12} /> : <Copy size={12} />} Copier
            </button>
          </div>
          <p className="mb-3 text-sm leading-relaxed text-ink/90 italic">{assets.cvSummary}</p>
          <ul className="space-y-2.5">
            {assets.cvHighlights.map((h, i) => (
              <motion.li
                key={h.skill}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="rounded-lg border border-line/40 bg-elevated/40 p-3"
              >
                <p className="text-xs font-bold uppercase tracking-wide text-ink">{h.skill}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-mute">{h.proof}</p>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Lettre */}
        <div className="flex flex-col rounded-xl border border-line/50 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Lettre de motivation
            </p>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => copy("letter", assets.coverLetter)}
                className="btn btn-ghost !px-2 !py-1 !text-[11px]"
              >
                {copied === "letter" ? <Check size={12} /> : <Copy size={12} />} Copier
              </button>
              <button
                type="button"
                onClick={() => copy("subject", assets.emailSubject)}
                className="btn btn-ghost !px-2 !py-1 !text-[11px]"
              >
                {copied === "subject" ? <Check size={12} /> : <Mail size={12} />} Objet
              </button>
            </div>
          </div>
          <pre className="max-h-[420px] flex-1 overflow-auto whitespace-pre-wrap rounded-lg border border-line/40 bg-elevated/40 p-3.5 font-sans text-[13px] leading-relaxed text-ink/90">
            {assets.coverLetter}
          </pre>
        </div>
      </div>

      <div className="rounded-xl border border-warn/30 bg-warn/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-ink">Relance automatique programmée</p>
            <p className="text-xs text-mute">
              Envoyée 7 jours après la candidature si aucune réponse — brouillon déjà rédigé.
            </p>
          </div>
          <button
            type="button"
            onClick={() => copy("follow", assets.followUpEmail)}
            className="btn btn-ghost !text-xs"
          >
            {copied === "follow" ? <Check size={13} /> : <Clipboard size={13} />} Voir le brouillon
          </button>
        </div>
        <pre className="mt-3 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line/40 bg-elevated/40 p-3 font-sans text-xs leading-relaxed text-mute">
          {assets.followUpEmail}
        </pre>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={onSent} className="btn btn-primary">
          <Zap size={15} /> Passer à l&apos;envoi 1-clic
        </button>
        <button type="button" onClick={generate} className="btn btn-ghost">
          <Sparkles size={15} /> Régénérer
        </button>
      </div>
    </div>
  );
}

/* ========================================================================== TAB 3 */
function ApplyTab({
  offer,
  analysis,
  status,
}: {
  offer: JobOffer;
  analysis: MatchAnalysis;
  status: Application["status"] | null;
}) {
  const { addApplication, toast, profile } = useApp();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(status !== null);

  const steps = [
    "Récupération de l'offre et vérification des prérequis",
    "Chargement du profil master (CV + préférences)",
    "Pré-remplissage des champs (identité, expérience, dispo)",
    "Jointion du CV adapté et de la lettre personnalisée",
    "Soumission + enregistrement dans le pipeline",
  ];

  const run = async () => {
    setRunning(true);
    setDone(false);
    for (let i = 0; i < steps.length; i++) {
      setStep(i);
      await new Promise((r) => setTimeout(r, 620));
    }

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: offer.title,
          company: offer.company,
          matchScore: analysis.score,
          channel: "formulaire",
          offerUrl: offer.url,
        }),
      });
      const json = await res.json();

      const now = new Date().toISOString();
      addApplication({
        id: json.id ?? `app_${Date.now()}`,
        offerId: offer.id,
        title: offer.title,
        company: offer.company,
        location: `${offer.location} · ${offer.remote}`,
        contract: offer.contract,
        salary: offer.salary,
        matchScore: analysis.score,
        status: "postule",
        appliedAt: json.appliedAt ?? now,
        followUpAt: json.followUpAt ?? new Date(Date.now() + 7 * 86_400_000).toISOString(),
        channel: "formulaire",
        events: [{ at: now, status: "postule", note: "Postulation 1-clic depuis l'AI Matcher" }],
      });

      setDone(true);
      toast({
        title: `Candidature envoyée à ${offer.company}`,
        body: "Relance programmée automatiquement à J+7.",
      });
    } catch {
      toast({ title: "Envoi échoué", body: "Vérifie ta connexion puis réessaie.", tone: "warn" });
    } finally {
      setRunning(false);
      setStep(-1);
    }
  };

  if (done) {
    return (
      <div className="grid place-items-center rounded-xl border border-good/40 bg-good/5 px-6 py-14 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-good/20 text-good">
          <Check size={28} />
        </span>
        <p className="mt-4 font-display text-lg font-bold text-ink">Candidature enregistrée</p>
        <p className="mt-1 max-w-md text-sm text-mute">
          {offer.company} · statut <span className="text-ink">Postulé</span> — relance planifiée à
          J+7. Tu peux suivre le process dans le pipeline.
        </p>
        <div className="mt-5 flex gap-2.5">
          <a href="/candidatures" className="btn btn-primary">
            Voir le pipeline <ArrowRight size={15} />
          </a>
          <a
            href={`mailto:?subject=${encodeURIComponent(assetsSubject(offer, profile.fullName))}`}
            className="btn btn-ghost"
          >
            <Mail size={15} /> Envoyer par email
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <InfoCell label="Destinataire" value={`recrutement@${offer.company.toLowerCase().replace(/[^a-z]/g, "")}.example`} />
        <InfoCell label="Objet" value={assetsSubject(offer, profile.fullName)} />
        <InfoCell label="Canaux disponibles" value="Formulaire de l'entreprise · Email · LinkedIn" />
      </div>

      <div className="rounded-xl border border-line/50 p-4">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-mute">
          Pipeline d&apos;envoi automatisé
        </p>
        <ul className="space-y-2.5">
          {steps.map((s, i) => {
            const state = step === i ? "active" : step > i ? "done" : "todo";
            return (
              <li key={s} className="flex items-center gap-3">
                <span
                  className={clsx(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[11px] font-bold",
                    state === "done" && "border-good/60 bg-good/15 text-good",
                    state === "active" && "border-accent bg-accent/15 text-accent",
                    state === "todo" && "border-line/60 text-mute"
                  )}
                >
                  {state === "done" ? <Check size={12} /> : i + 1}
                </span>
                <span className={clsx("text-sm", state === "todo" ? "text-mute" : "text-ink")}>{s}</span>
                {state === "active" && <Spinner size={13} />}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button type="button" onClick={run} disabled={running} className="btn btn-primary">
          <Send size={15} /> {running ? "Envoi en cours…" : "Postuler en 1 clic"}
        </button>
        <a
          href={`mailto:?subject=${encodeURIComponent(assetsSubject(offer, profile.fullName))}&body=${encodeURIComponent(
            `Candidature pour le poste ${offer.title} chez ${offer.company}.`
          )}`}
          className="btn btn-ghost"
        >
          <Mail size={15} /> Voie manuelle (mailto)
        </a>
      </div>

      <p className="text-[11px] leading-relaxed text-mute">
        En mode démo l&apos;envoi est simulé côté client ; branche Supabase + un provider email
        (Resend / SMTP) dans <code className="font-mono text-accent">app/api/apply</code> pour la
        production.
      </p>
    </div>
  );
}

function assetsSubject(offer: JobOffer, fullName: string) {
  return `Candidature — ${offer.title} (${fullName})`;
}
