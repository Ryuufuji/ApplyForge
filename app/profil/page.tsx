"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  BadgeCheck,
  Briefcase,
  Check,
  ClipboardPaste,
  FileUp,
  GraduationCap,
  MapPin,
  Mail,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Wand2,
} from "lucide-react";
import clsx from "clsx";
import { Badge, Bar, Card, ScoreRing, SectionHeader, Spinner } from "@/components/ui";
import { CONTRACTS, REMOTE_MODES } from "@/lib/analytics";
import type { ProfileParseReport } from "@/lib/ai/profileFromText";
import type { ContractType, Profile, RemoteMode } from "@/lib/types";
import { useApp } from "@/lib/store";

/* Valeurs de démonstration : toujours proposées, mais jamais à la place de ce
   qui a réellement été lu dans le CV importé (cf. sectorOptions plus bas). */
const DEMO_SECTORS = ["SaaS / B2B", "Fintech", "AI / Data", "E-commerce", "Créatif", "Conseil"];
const DEMO_LOCATIONS = ["Lyon", "Paris", "Grenoble", "Remote Europe", "Nantes"];

/* ============================================================================
   PROFIL & BASE MASTER — CV de base, parcours, compétences, préférences.
   L'import du CV (PDF / DOCX / texte) reconstruit l'intégralité du profil côté
   serveur (route /api/cv) puis alimente le store global après validation.
   ========================================================================== */

export default function ProfilPage() {
  const { profile, applyProfile, resetProfile, toast } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);

  const [prefs, setPrefs] = useState(profile.preferences);
  const [saved, setSaved] = useState(false);

  // Import de CV → reconstruction du profil
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarnings, setImportWarnings] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ profile: Profile; report: ProfileParseReport } | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [sourceName, setSourceName] = useState("");

  const cv = profile.masterCv;

  // Les listes de préférences doivent suivre le profil courant : un CV importé
  // peut viser des secteurs, des contrats ou des villes absents de la démo.
  const sectorOptions = unique([...profile.preferences.sectors, ...DEMO_SECTORS]);
  const contractOptions = unique<ContractType>([...CONTRACTS, ...prefs.contracts]);
  const remoteOptions = unique<RemoteMode>([...REMOTE_MODES, ...prefs.remote]);
  const locationOptions = unique([...prefs.locations, ...DEMO_LOCATIONS]);
  const salaryFloor = floorTo(Math.min(20_000, prefs.salaryMin - 5_000), 2_000);
  const salaryCeil = ceilTo(Math.max(150_000, prefs.salaryMax + 5_000), 2_000);

  // Le profil vient du store : on resynchronise les préférences éditées à
  // chaque nouveau profil appliqué (import de CV, reset démo…).
  useEffect(() => {
    setPrefs(profile.preferences);
  }, [profile.preferences]);

  const toggle = <T extends string>(
    list: T[],
    value: T,
    setter: (v: T[]) => void
  ) => setter(list.includes(value) ? list.filter((x) => x !== value) : [...list, value]);

  const save = () => {
    applyProfile({ ...profile, preferences: prefs });
    setSaved(true);
    toast({ title: "Profil master enregistré", body: "Les prochaines candidatures utiliseront ces préférences." });
    setTimeout(() => setSaved(false), 2500);
  };

  /** Envoie le CV (fichier ou texte) au serveur et prépare l'aperçu. */
  const runImport = async (input: { file?: File; text?: string }) => {
    setImporting(true);
    setImportError(null);
    setImportWarnings([]);
    setPreview(null);

    try {
      const res = input.file
        ? await fetch("/api/cv", { method: "POST", body: (() => {
            const fd = new FormData();
            fd.append("file", input.file as File);
            return fd;
          })() })
        : await fetch("/api/cv", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: input.text }),
          });

      const data = (await res.json().catch(() => null)) as
        | { error?: string; profile?: Profile; report?: ProfileParseReport; warnings?: string[] }
        | null;

      if (!res.ok || !data?.profile || !data.report) {
        setImportWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
        setImportError(data?.error ?? "Import impossible : le CV n'a pas pu être lu.");
        return;
      }

      setPreview({ profile: data.profile, report: data.report });
      setImportWarnings(data.warnings ?? []);
      setSourceName(input.file?.name ?? "texte collé");
      toast({
        title: "CV analysé",
        body: `${data.report.confidence} % de confiance — vérifie l'aperçu avant d'appliquer.`,
      });
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import impossible.");
    } finally {
      setImporting(false);
    }
  };

  const applyPreview = () => {
    if (!preview) return;
    applyProfile(preview.profile);
    setPrefs(preview.profile.preferences);
    toast({
      title: "Profil reconstruit",
      body: `${preview.profile.skills.length} compétences · ${preview.profile.experience.length} expériences · ATS ${preview.profile.masterCv.atsScore}`,
    });
    setPreview(null);
    setImportWarnings([]);
    setPasteOpen(false);
    setPasteText("");
    setSourceName("");
  };

  return (
    <div className="space-y-7">
      <SectionHeader
        index="base master / profil"
        title="Profil & préférences"
        subtitle="La source de vérité utilisée par l'AI Matcher et par le 1-Click Prep pour chaque candidature."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetProfile();
                toast({ title: "Profil démo restauré", body: "Les données de démonstration sont de retour.", tone: "info" });
              }}
              className="btn btn-ghost !py-2.5"
              title="Revenir au profil de démonstration"
            >
              <RotateCcw size={15} /> Réinitialiser
            </button>
            <button type="button" onClick={save} className="btn btn-primary !py-2.5">
              {saved ? <BadgeCheck size={15} /> : <Save size={15} />} {saved ? "Enregistré" : "Sauvegarder"}
            </button>
          </div>
        }
      />

      {/* ------------------------------------------------ IMPORT AUTO DU CV */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              <Wand2 size={12} /> Import automatique
            </p>
            <h3 className="font-display text-lg font-bold text-ink">
              Dépose ton CV, le profil se reconstruit tout seul
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-mute">
              PDF, DOCX ou texte : identité, résumé, compétences, expériences, formation et
              préférences sont extraits du document, puis appliqués à ta base master.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.txt,.md,.csv,.html,.htm,.rtf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void runImport({ file });
              }}
            />
            <button
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              className="btn btn-primary !py-2.5"
            >
              {importing ? <Spinner size={15} /> : <FileUp size={15} />}
              {importing ? "Analyse du CV…" : "Importer mon CV"}
            </button>
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              className="btn btn-ghost !py-2.5"
            >
              <ClipboardPaste size={15} /> Coller le texte
            </button>
          </div>
        </div>

        {pasteOpen && (
          <div className="mt-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={6}
              placeholder="Colle ici le contenu de ton CV (Ctrl/Cmd + V)…"
              className="input resize-y font-mono text-xs leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={importing || pasteText.trim().length < 120}
                onClick={() => void runImport({ text: pasteText })}
                className="btn btn-primary !py-2.5"
              >
                <Wand2 size={15} /> Reconstruire depuis ce texte
              </button>
              <span className="text-[11px] text-mute">
                {pasteText.trim().length} caractères (120 minimum)
              </span>
            </div>
          </div>
        )}

        {importing && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-line/60 bg-elevated/40 p-4 text-xs text-mute">
            <Spinner size={16} /> Lecture du document et extraction du profil…
          </div>
        )}

        {importError && !importing && (
          <div className="mt-4 flex items-start gap-3 rounded-xl border border-bad/40 bg-bad/10 p-4 text-xs text-bad">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold">Import impossible</p>
              <p className="mt-0.5 leading-relaxed text-bad/90">{importError}</p>
              {importWarnings.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-bad/80">
                  {importWarnings.map((w) => (
                    <li key={w}>• {w}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {preview && !importing && (
          <div className="mt-4 rounded-xl border border-accent/40 bg-accent/5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                  <Check size={15} className="text-good" /> Profil reconstruit depuis « {sourceName} »
                </p>
                <p className="mt-0.5 text-[11px] text-mute">
                  Confiance {preview.report.confidence}% · {preview.profile.skills.length} compétences ·{" "}
                  {preview.profile.experience.length} expériences · {preview.profile.education.length} formations · ATS{" "}
                  {preview.profile.masterCv.atsScore}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={applyPreview} className="btn btn-primary !py-2.5">
                  <Check size={15} /> Appliquer au profil
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPreview(null);
                    setImportWarnings([]);
                  }}
                  className="btn btn-ghost !py-2.5"
                >
                  Annuler
                </button>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <PreviewItem
                label="Identité"
                value={preview.profile.fullName}
                sub={preview.profile.headline}
              />
              <PreviewItem
                label="Contact"
                value={preview.profile.email || "—"}
                sub={`${preview.profile.phone || "—"} · ${preview.profile.location || "—"}`}
              />
              <PreviewItem
                label="Parcours"
                value={`${preview.profile.yearsOfExperience} ans`}
                sub={
                  preview.profile.experience
                    .slice(0, 2)
                    .map((e) => e.company)
                    .join(" · ") || "—"
                }
              />
            </div>

            <PreviewBlock label={`Parcours lu (${preview.profile.experience.length})`}>
              {preview.profile.experience.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-mute">
                  Aucune expérience datée détectée : ajoute-la à la main après l'import.
                </p>
              ) : (
                <ul className="space-y-2">
                  {preview.profile.experience.map((xp) => (
                    <li key={xp.id} className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-xs font-semibold text-ink">{xp.role}</span>
                        <span className="max-w-full truncate text-[11px] text-accent">
                          {xp.company}
                          {xp.location ? ` · ${xp.location}` : ""}
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-mute">{xp.period}</span>
                      </div>
                      {xp.highlights.length > 0 && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-mute">
                          → {xp.highlights[0]}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </PreviewBlock>

            {preview.profile.education.length > 0 && (
              <PreviewBlock label={`Formation (${preview.profile.education.length})`}>
                <ul className="space-y-2">
                  {preview.profile.education.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-semibold text-ink">{e.degree}</span>
                      {e.school && e.school !== "—" && (
                        <span className="max-w-full truncate text-[11px] text-mute">{e.school}</span>
                      )}
                      <span className="ml-auto font-mono text-[10px] text-mute">{e.period}</span>
                    </li>
                  ))}
                </ul>
              </PreviewBlock>
            )}

            <PreviewBlock label={`Compétences détectées (${preview.profile.skills.length})`}>
              {preview.profile.skills.length === 0 ? (
                <p className="text-[11px] leading-relaxed text-mute">
                  Aucune compétence reconnue automatiquement — complète la liste dans le profil.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {preview.profile.skills.slice(0, 18).map((s) => (
                    <span
                      key={s.name}
                      className="max-w-full truncate rounded-md bg-accent/12 px-2 py-1 text-[10px] text-accent"
                    >
                      {s.name} <span className="font-mono text-mute">{s.level}</span>
                    </span>
                  ))}
                </div>
              )}
            </PreviewBlock>

            {importWarnings.length > 0 && (
              <ul className="mt-3 space-y-0.5 text-[11px] text-warn">
                {importWarnings.map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-5">
          {/* Identité */}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-start gap-5">
              <div className="relative grid h-20 w-20 shrink-0 place-items-center rounded-2xl bg-accent-gradient font-display text-2xl font-bold text-accent-contrast shadow-glow">
                {profile.avatarInitials}
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display text-2xl font-bold text-ink">{profile.fullName}</h2>
                <p className="text-sm text-mute">{profile.headline}</p>
                <div className="mt-3 flex flex-wrap gap-3 text-xs text-mute">
                  <span className="flex items-center gap-1.5">
                    <Mail size={12} className="text-accent" /> {profile.email}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Phone size={12} className="text-accent" /> {profile.phone}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-accent" /> {profile.location}
                  </span>
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink/85">{profile.summary}</p>
              </div>
            </div>
          </Card>

          {/* Expériences */}
          <Card className="p-5 sm:p-6">
            <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Parcours
            </p>
            <div className="relative space-y-5 before:absolute before:left-[7px] before:top-2 before:h-[calc(100%-1rem)] before:w-px before:bg-line/60">
              {profile.experience.map((xp, i) => (
                <motion.div
                  key={xp.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08 }}
                  className="relative pl-7"
                >
                  <span className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-accent bg-canvas shadow-glow-soft" />
                  <div className="rounded-xl border border-line/50 bg-elevated/40 p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-display text-sm font-bold text-ink">{xp.role}</p>
                      <span className="font-mono text-[11px] text-mute">{xp.period}</span>
                    </div>
                    <p className="text-xs text-accent">
                      {xp.company}
                      {xp.location ? ` · ${xp.location}` : ""}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {xp.highlights.map((h) => (
                        <li key={h} className="text-xs leading-relaxed text-mute">
                          → {h}
                        </li>
                      ))}
                    </ul>
                  </div>
                </motion.div>
              ))}
            </div>

            <p className="mb-3 mt-6 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Formation
            </p>
            <div className="space-y-2">
              {profile.education.map((e) => (
                <div key={e.id} className="flex items-center gap-3 rounded-lg border border-line/50 p-3">
                  <GraduationCap size={15} className="text-accent" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{e.degree}</p>
                    <p className="truncate text-xs text-mute">{e.school}</p>
                  </div>
                  <span className="ml-auto font-mono text-[11px] text-mute">{e.period}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Compétences */}
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
                Compétences ({profile.skills.length})
              </p>
              <Badge tone="good">ATS {cv.atsScore}/100</Badge>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3.5 sm:grid-cols-2">
              {profile.skills.map((s, i) => (
                <div key={s.name}>
                  <div className="mb-1 flex items-baseline justify-between text-xs">
                    <span className="font-semibold text-ink">
                      {s.name}
                      {s.years && <span className="ml-1.5 font-normal text-mute">· {s.years} ans</span>}
                    </span>
                    <span className="font-mono text-[11px] text-mute">{s.level}</span>
                  </div>
                  <Bar value={s.level} delay={i * 0.03} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------ COLONNE DROITE */}
        <div className="space-y-5">
          {/* CV master */}
          <Card className="p-5">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              CV master
            </p>
            <div className="flex items-center gap-4">
              <ScoreRing score={cv.atsScore} size={76} label="ATS" />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{cv.fileName}</p>
                <p className="font-mono text-[11px] text-mute">
                  {cv.sizeKo} Ko · {new Date(cv.uploadedAt).toLocaleDateString("fr-FR")}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
              className="btn btn-ghost mt-4 w-full"
            >
              {importing ? <Spinner size={15} /> : <FileUp size={15} />}
              {importing ? "Analyse en cours…" : "Importer un nouveau CV"}
            </button>
            <button type="button" onClick={() => setPasteOpen(true)} className="btn btn-ghost mt-2 w-full">
              <ClipboardPaste size={15} /> Coller le texte du CV
            </button>
            <p className="mt-2 text-[11px] leading-relaxed text-mute">
              Le CV master sert de base : chaque import reconstruit ton identité, tes compétences,
              ton parcours et tes préférences, puis le 1-Click Prep les réorganise par candidature.
            </p>
          </Card>

          {/* Préférences */}
          <Card className="p-5">
            <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              Préférences de recherche
            </p>

            <PrefGroup label="Secteurs">
              {sectorOptions.map((s) => (
                <Chip
                  key={s}
                  active={prefs.sectors.includes(s)}
                  onClick={() => toggle(prefs.sectors, s, (v) => setPrefs({ ...prefs, sectors: v }))}
                >
                  {s}
                </Chip>
              ))}
            </PrefGroup>

            <PrefGroup label="Contrats">
              {contractOptions.map((c) => (
                <Chip
                  key={c}
                  active={prefs.contracts.includes(c)}
                  onClick={() => toggle(prefs.contracts, c, (v) => setPrefs({ ...prefs, contracts: v }))}
                >
                  {c}
                </Chip>
              ))}
            </PrefGroup>

            <PrefGroup label="Mode de travail">
              {remoteOptions.map((r) => (
                <Chip
                  key={r}
                  active={prefs.remote.includes(r)}
                  onClick={() => toggle(prefs.remote, r, (v) => setPrefs({ ...prefs, remote: v }))}
                >
                  {r}
                </Chip>
              ))}
            </PrefGroup>

            <PrefGroup label="Localisations">
              {locationOptions.map((l) => (
                <Chip
                  key={l}
                  active={prefs.locations.includes(l)}
                  onClick={() => toggle(prefs.locations, l, (v) => setPrefs({ ...prefs, locations: v }))}
                >
                  {l}
                </Chip>
              ))}
            </PrefGroup>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-mute">Prétentions salariales</span>
                <span className="font-mono font-bold text-ink">
                  {Math.round(prefs.salaryMin / 1000)}k – {Math.round(prefs.salaryMax / 1000)}k €
                </span>
              </div>
              <input
                type="range"
                min={salaryFloor}
                max={salaryCeil}
                step={2000}
                value={prefs.salaryMin}
                onChange={(e) => setPrefs({ ...prefs, salaryMin: Number(e.target.value) })}
                className="w-full accent-[rgb(var(--c-accent))]"
              />
              <input
                type="range"
                min={salaryFloor}
                max={salaryCeil}
                step={2000}
                value={prefs.salaryMax}
                onChange={(e) => setPrefs({ ...prefs, salaryMax: Number(e.target.value) })}
                className="mt-1 w-full accent-[rgb(var(--c-accent))]"
              />
            </div>

            <div className="mt-4">
              <p className="mb-1.5 text-xs text-mute">Mots-clés prioritaires</p>
              <div className="flex flex-wrap gap-1.5">
                {prefs.keywords.map((k) => (
                  <span key={k} className="rounded-md bg-accent/12 px-2 py-1 font-mono text-[10px] text-accent">
                    {k}
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const k = prompt("Nouveau mot-clé ?");
                    if (k) setPrefs({ ...prefs, keywords: [...prefs.keywords, k.trim()] });
                  }}
                  className="flex items-center gap-1 rounded-md border border-dashed border-line/70 px-2 py-1 font-mono text-[10px] text-mute hover:border-accent hover:text-accent"
                >
                  <Plus size={10} /> ajouter
                </button>
              </div>
            </div>

            <button type="button" onClick={save} className={clsx("btn mt-5 w-full", saved ? "btn-ghost" : "btn-primary")}>
              {saved ? <BadgeCheck size={15} /> : <Save size={15} />}
              {saved ? "Préférences enregistrées" : "Enregistrer les préférences"}
            </button>
          </Card>

          <Card className="p-5">
            <p className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.2em] text-accent">
              <Sparkles size={12} /> Base master
            </p>
            <ul className="space-y-2 text-xs text-mute">
              <li className="flex gap-2">
                <Briefcase size={12} className="mt-0.5 shrink-0 text-accent" />
                {profile.experience.length} expériences indexées pour la personnalisation
              </li>
              <li className="flex gap-2">
                <FileUp size={12} className="mt-0.5 shrink-0 text-accent" />
                CV + lettre de base versionnés (Supabase Storage)
              </li>
              <li className="flex gap-2">
                <BadgeCheck size={12} className="mt-0.5 shrink-0 text-accent" />
                Chaque génération cite des preuves chiffrées de ton parcours
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

/** Bloc de vérification de l'import : intitulé + contenu, sans débordement. */
function PreviewBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 min-w-0">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-mute">{label}</p>
      <div className="min-w-0 rounded-lg border border-line/50 bg-elevated/40 p-3">{children}</div>
    </div>
  );
}

function PreviewItem({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line/50 bg-elevated/40 p-3">
      <p className="font-mono text-[10px] uppercase tracking-widest text-mute">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-[11px] text-mute">{sub}</p>}
    </div>
  );
}

function PrefGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <p className="mb-2 text-xs text-mute">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-all",
        active
          ? "border-accent/70 bg-accent/14 text-accent shadow-glow-soft"
          : "border-line/60 text-mute hover:border-accent/40 hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

/** Déduplique en conservant l'ordre d'apparition. */
function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list));
}

function floorTo(value: number, step: number) {
  return Math.floor(value / step) * step;
}

function ceilTo(value: number, step: number) {
  return Math.ceil(value / step) * step;
}
