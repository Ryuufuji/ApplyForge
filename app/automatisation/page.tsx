"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Bot,
  Check,
  Clock,
  ExternalLink,
  ListChecks,
  Mail,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Rocket,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";
import { Badge, Card, EmptyState, SectionHeader, Spinner } from "@/components/ui";
import { CONTRACTS, REMOTE_MODES } from "@/lib/analytics";
import { useAutomation } from "@/lib/auto/useAutomation";
import type { AutoSourceKind, QueueItem } from "@/lib/auto/types";
import type { ContractType, RemoteMode } from "@/lib/types";

/* ============================================================================
   PAGE AUTOMATISATION — centre de contrôle du pilote.
   Mode supervisé : collecte + scoring + file d'attente, validation humaine.
   Mode autonome  : envoi automatique sous plafonds + relances J+7.
   ========================================================================== */

const parseList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-mute">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mute">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-line/70 bg-elevated/60 px-3 py-2 text-sm text-ink outline-none transition focus:border-accent/70";
const numCls = `${inputCls} font-mono`;

const STATE_META: Record<QueueItem["state"], { label: string; tone: "default" | "accent" | "good" | "warn" | "bad" | "alt" }> = {
  queued: { label: "en attente", tone: "warn" },
  sent: { label: "envoyée", tone: "good" },
  handed_off: { label: "remise", tone: "alt" },
  failed: { label: "échec", tone: "bad" },
  rejected: { label: "refusée", tone: "bad" },
  blocked: { label: "bloquée", tone: "default" },
};

const hhmm = (iso: string | number) =>
  new Date(iso).toLocaleTimeString("fr-BE", { hour: "2-digit", minute: "2-digit" });

export default function AutomatisationPage() {
  const auto = useAutomation();
  const { config, setConfig, running, providers, ready } = auto;
  const [srcKind, setSrcKind] = useState<AutoSourceKind>("rss");
  const [srcLabel, setSrcLabel] = useState("");
  const [srcUrl, setSrcUrl] = useState("");

  const rules = config.rules;
  const caps = config.caps;
  const setRules = (patch: Partial<typeof rules>) =>
    setConfig((c) => ({ ...c, rules: { ...c.rules, ...patch } }));
  const setCaps = (patch: Partial<typeof caps>) =>
    setConfig((c) => ({ ...c, caps: { ...c.caps, ...patch } }));

  const addSource = () => {
    if (srcKind !== "catalogue" && !srcUrl.trim()) return;
    setConfig((c) => ({
      ...c,
      sources: [
        ...c.sources,
        {
          id: `src_${Date.now().toString(36)}`,
          label: srcLabel.trim() || new URL(srcUrl.trim()).hostname.replace(/^www\./, "") || "Source",
          kind: srcKind,
          url: srcKind === "catalogue" ? "" : srcUrl.trim(),
          enabled: true,
        },
      ],
    }));
    setSrcLabel("");
    setSrcUrl("");
  };

  const queueStats = {
    queued: auto.queue.filter((q) => q.state === "queued"),
    handedOff: auto.queue.filter((q) => q.state === "handed_off"),
    sent: auto.queue.filter((q) => q.state === "sent").length,
    rejected: auto.queue.filter((q) => q.state === "rejected").length,
    blocked: auto.queue.filter((q) => q.state === "blocked").length,
  };

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader
        index="00 / pilote"
        title="Pilote automatique"
        subtitle="Collecte d'offres, scoring sous règles strictes, mise en file ou envoi automatique, relances J+7 — tout est borné et journalisé."
        action={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => auto.runCycle()}
              disabled={running || !ready}
              className="btn btn-primary"
            >
              {running ? <Spinner size={14} /> : <Play size={14} />} Lancer un cycle
            </button>
            <button
              type="button"
              onClick={() => setConfig((c) => ({ ...c, schedulerOn: !c.schedulerOn }))}
              className={`btn ${config.schedulerOn ? "btn-ghost" : "btn-primary"}`}
            >
              {config.schedulerOn ? <Pause size={14} /> : <Clock size={14} />}
              {config.schedulerOn ? "Planification active" : "Activer la planification"}
            </button>
          </div>
        }
      />

      {/* --------------------------------------------------------- statut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            mode d'opération
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  id: "supervise" as const,
                  icon: ListChecks,
                  title: "Supervisé",
                  body: "Le pilote collecte, note et met en file. Tu approuves chaque envoi.",
                },
                {
                  id: "autonomous" as const,
                  icon: Rocket,
                  title: "Autonome",
                  body: "Envoi automatique sous plafonds (cycle/jour/site) + relances auto.",
                },
              ]
            ).map((m) => {
              const active = config.mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, mode: m.id }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    active
                      ? "border-accent/70 bg-accent/10 shadow-glow-soft"
                      : "border-line/70 bg-elevated/40 hover:border-accent/40"
                  }`}
                >
                  <span className="flex items-center gap-2 font-display text-sm font-bold text-ink">
                    <m.icon size={15} className={active ? "text-accent" : "text-mute"} />
                    {m.title} {active && <Badge tone="accent">actif</Badge>}
                  </span>
                  <span className="mt-1.5 block text-xs leading-relaxed text-mute">{m.body}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Field label="Intervalle (min)">
              <input
                type="number"
                min={1}
                max={1440}
                className={numCls}
                value={config.intervalMin}
                onChange={(e) =>
                  setConfig((c) => ({ ...c, intervalMin: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </Field>
            <Field label="Relances automatiques">
              <button
                type="button"
                onClick={() => setConfig((c) => ({ ...c, autoRelance: !c.autoRelance }))}
                className={`${inputCls} flex items-center justify-between`}
              >
                J+7 {config.autoRelance ? <Badge tone="good">actives</Badge> : <Badge tone="default">off</Badge>}
              </button>
            </Field>
            <Field label="Prochain cycle">
              <div className={`${inputCls} font-mono`}>
                {config.schedulerOn && auto.nextRunAt
                  ? hhmm(auto.nextRunAt)
                  : config.schedulerOn
                    ? "dès le prochain tick"
                    : "manuel"}
              </div>
            </Field>
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            état des services
          </p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-mute">
                <Mail size={13} /> Provider email
              </span>
              {providers === null ? (
                <Badge tone="default">…</Badge>
              ) : providers.email ? (
                <Badge tone="good">actif</Badge>
              ) : (
                <Badge tone="warn">absent → remise humaine</Badge>
              )}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-mute">
                <Bot size={13} /> Moteur LLM
              </span>
              {providers?.llm ? <Badge tone="good">actif</Badge> : <Badge tone="default">règles locales</Badge>}
            </li>
            <li className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-mute">
                <ShieldAlert size={13} /> Supabase
              </span>
              {providers?.supabase ? <Badge tone="good">branché</Badge> : <Badge tone="default">mode local</Badge>}
            </li>
          </ul>
          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line/50 pt-4 text-center">
            <div>
              <p className="font-mono text-xl font-bold text-ink">{queueStats.queued.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-mute">en file</p>
            </div>
            <div>
              <p className="font-mono text-xl font-bold text-ink">
                {auto.sentToday}
                <span className="text-sm text-mute">/{caps.perDay}</span>
              </p>
              <p className="text-[10px] uppercase tracking-wider text-mute">aujourd'hui</p>
            </div>
            <div>
              <p className="font-mono text-xl font-bold text-ink">{auto.dueRelances.length}</p>
              <p className="text-[10px] uppercase tracking-wider text-mute">relances dues</p>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------- règles */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            règles strictes
          </p>
          <div className="space-y-4">
            <Field label={`Score minimal — ${rules.minScore} %`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={rules.minScore}
                onChange={(e) => setRules({ minScore: Number(e.target.value) })}
                className="w-full accent-[rgb(var(--c-accent))]"
              />
            </Field>
            <Field label="Secteurs admis" hint="Vide = tous. Ex. Logistique, Sécurité">
              <input
                className={inputCls}
                defaultValue={rules.sectors.join(", ")}
                onBlur={(e) => setRules({ sectors: parseList(e.target.value) })}
                placeholder="Logistique, Sécurité…"
              />
            </Field>
            <Field label="Contrats admis">
              <div className="flex flex-wrap gap-1.5">
                {CONTRACTS.map((c: ContractType) => {
                  const on = rules.contracts.includes(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() =>
                        setRules({
                          contracts: on ? rules.contracts.filter((x) => x !== c) : [...rules.contracts, c],
                        })
                      }
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                        on ? "border-accent/70 bg-accent/15 text-ink" : "border-line/70 text-mute hover:text-ink"
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Modes de travail">
              <div className="flex flex-wrap gap-1.5">
                {REMOTE_MODES.map((r: RemoteMode) => {
                  const on = rules.remote.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setRules({
                          remote: on ? rules.remote.filter((x) => x !== r) : [...rules.remote, r],
                        })
                      }
                      className={`rounded-md border px-2 py-1 font-mono text-[11px] transition ${
                        on ? "border-accent/70 bg-accent/15 text-ink" : "border-line/70 text-mute hover:text-ink"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Villes admises" hint="Vide = toutes">
                <input
                  className={inputCls}
                  defaultValue={rules.locations.join(", ")}
                  onBlur={(e) => setRules({ locations: parseList(e.target.value) })}
                  placeholder="Bruxelles, Anvers…"
                />
              </Field>
              <Field label="Salaire annuel mini (€)" hint="0 = ignoré">
                <input
                  type="number"
                  className={numCls}
                  defaultValue={rules.salaryMin}
                  onBlur={(e) => setRules({ salaryMin: Math.max(0, Number(e.target.value) || 0) })}
                />
              </Field>
            </div>
            <Field label="Liste noire" hint="Entreprises ou hôtes interdits, séparés par des virgules">
              <input
                className={inputCls}
                defaultValue={rules.blacklist.join(", ")}
                onBlur={(e) => setRules({ blacklist: parseList(e.target.value) })}
                placeholder="viafoura, plateforme-arnaque…"
              />
            </Field>
          </div>
        </Card>

        <Card>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            plafonds de sécurité
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Envois par cycle">
              <input
                type="number"
                min={1}
                max={50}
                className={numCls}
                defaultValue={caps.perCycle}
                onBlur={(e) => setCaps({ perCycle: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </Field>
            <Field label="Envois par jour">
              <input
                type="number"
                min={1}
                max={100}
                className={numCls}
                defaultValue={caps.perDay}
                onBlur={(e) => setCaps({ perDay: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
              />
            </Field>
            <Field label="Cooldown par site (jours)" hint="Aucune re-candidature avant ce délai">
              <input
                type="number"
                min={0}
                max={365}
                className={numCls}
                defaultValue={caps.perHostCooldownDays}
                onBlur={(e) =>
                  setCaps({ perHostCooldownDays: Math.min(365, Math.max(0, Number(e.target.value) || 0)) })
                }
              />
            </Field>
            <Field label="Délai entre envois (ms)">
              <input
                type="number"
                min={0}
                max={10000}
                step={100}
                className={numCls}
                defaultValue={caps.delayBetweenMs}
                onBlur={(e) =>
                  setCaps({ delayBetweenMs: Math.min(10000, Math.max(0, Number(e.target.value) || 0)) })
                }
              />
            </Field>
            <Field label="Relances par cycle">
              <input
                type="number"
                min={0}
                max={30}
                className={numCls}
                defaultValue={caps.relancesPerCycle}
                onBlur={(e) =>
                  setCaps({ relancesPerCycle: Math.min(30, Math.max(0, Number(e.target.value) || 0)) })
                }
              />
            </Field>
          </div>

          <p className="mb-4 mt-6 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            sources de collecte
          </p>
          <ul className="space-y-2">
            {config.sources.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-line/60 bg-elevated/40 px-3 py-2"
              >
                <input
                  type="checkbox"
                  checked={s.enabled}
                  onChange={() =>
                    setConfig((c) => ({
                      ...c,
                      sources: c.sources.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)),
                    }))
                  }
                  className="accent-[rgb(var(--c-accent))]"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{s.label}</span>
                <Badge tone={s.kind === "catalogue" ? "accent" : "default"}>{s.kind}</Badge>
                <button
                  type="button"
                  aria-label={`Supprimer ${s.label}`}
                  onClick={() =>
                    setConfig((c) => ({ ...c, sources: c.sources.filter((x) => x.id !== s.id) }))
                  }
                  className="text-mute transition hover:text-bad"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <select
              value={srcKind}
              onChange={(e) => setSrcKind(e.target.value as AutoSourceKind)}
              className={`${inputCls} w-auto`}
            >
              <option value="rss">Flux RSS</option>
              <option value="list">Page de liste</option>
              <option value="catalogue">Catalogue local</option>
            </select>
            <input
              className={`${inputCls} w-auto flex-1`}
              placeholder="Libellé (optionnel)"
              value={srcLabel}
              onChange={(e) => setSrcLabel(e.target.value)}
            />
            <input
              className={`${inputCls} w-full sm:w-auto sm:flex-[2]`}
              placeholder="https://… (URL du flux ou de la page)"
              value={srcUrl}
              onChange={(e) => setSrcUrl(e.target.value)}
            />
            <button type="button" onClick={addSource} className="btn btn-primary">
              <Plus size={14} /> Ajouter
            </button>
          </div>
        </Card>
      </div>

      {/* ----------------------------------------------------- file d'attente */}
      <Card>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
              file d'attente
            </p>
            <h3 className="font-display text-lg font-bold text-ink">
              {queueStats.queued.length} à valider · {queueStats.handedOff.length} remises ·{" "}
              {queueStats.sent} envoyées
            </h3>
          </div>
          {auto.report && (
            <p className="font-mono text-[11px] text-mute">
              dernier cycle {hhmm(auto.report.startedAt)} — {auto.report.collected} collectées,{" "}
              {auto.report.accepted} acceptées, {auto.report.rejected} rejetées,{" "}
              {auto.report.blocked.length} bloquées
            </p>
          )}
        </div>

        {queueStats.queued.length === 0 && queueStats.handedOff.length === 0 ? (
          <EmptyState
            title="File vide"
            body="Lance un cycle : le pilote collecte les offres, les note selon tes règles et remplit cette file."
            action={
              <button type="button" onClick={() => auto.runCycle()} disabled={running} className="btn btn-primary">
                {running ? <Spinner size={14} /> : <Play size={14} />} Lancer un cycle
              </button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {[...queueStats.handedOff, ...queueStats.queued].slice(0, 30).map((item) => {
              const meta = STATE_META[item.state];
              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-wrap items-center gap-3 rounded-xl border border-line/60 bg-elevated/40 px-4 py-3"
                >
                  <span
                    className={`font-mono text-sm font-bold ${
                      item.score >= 80 ? "text-good" : item.score >= 60 ? "text-warn" : "text-bad"
                    }`}
                  >
                    {item.score}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{item.title}</p>
                    <p className="truncate text-xs text-mute">
                      {item.company} · {item.location} · {item.contract} · {item.source}
                    </p>
                    {item.note && <p className="mt-0.5 truncate text-[11px] text-mute">{item.note}</p>}
                  </div>
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                  <div className="flex items-center gap-1.5">
                    {item.state === "queued" && (
                      <>
                        <button
                          type="button"
                          onClick={() => auto.approve(item.id)}
                          disabled={running}
                          className="btn btn-primary !px-3 !py-1.5"
                        >
                          <Check size={13} /> Approuver
                        </button>
                        <button
                          type="button"
                          onClick={() => auto.reject(item.id)}
                          className="btn btn-ghost !px-3 !py-1.5"
                        >
                          <X size={13} /> Refuser
                        </button>
                      </>
                    )}
                    {item.state === "handed_off" && item.mailto && (
                      <a href={item.mailto} className="btn btn-primary !px-3 !py-1.5">
                        <Mail size={13} /> Ouvrir le mail
                      </a>
                    )}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-ghost !px-3 !py-1.5"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
        {(queueStats.rejected > 0 || queueStats.blocked > 0) && (
          <p className="mt-3 font-mono text-[11px] text-mute">
            {queueStats.rejected} refusée(s) · {queueStats.blocked} bloquée(s) par les plafonds — détails
            dans le journal.
          </p>
        )}
      </Card>

      {/* ---------------------------------------------------------- relances */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            relances du dernier cycle
          </p>
          {!auto.report || auto.report.relances.length === 0 ? (
            <p className="text-sm text-mute">
              Aucune relance traitée au dernier cycle — les candidatures de plus de 7 jours sans réponse
              apparaîtront ici.
            </p>
          ) : (
            <ul className="space-y-2">
              {auto.report.relances.map((r) => (
                <li
                  key={r.applicationId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line/60 bg-elevated/40 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {r.company} · <span className="text-mute">{r.title}</span>
                    </p>
                    <p className="truncate text-[11px] text-mute">{r.note}</p>
                  </div>
                  <Badge tone={r.ok ? "good" : "warn"}>{r.ok ? "traitée" : "à corriger"}</Badge>
                  {r.mailto && (
                    <a href={r.mailto} className="btn btn-primary !px-3 !py-1.5">
                      <Mail size={13} /> Envoyer
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
            relances dues maintenant
          </p>
          {auto.dueRelances.length === 0 ? (
            <p className="text-sm text-mute">Toutes les relances J+7 sont à jour. 🎯</p>
          ) : (
            <ul className="space-y-2">
              {auto.dueRelances.slice(0, 8).map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-warn/40 bg-warn/5 px-3 py-2.5"
                >
                  <Clock size={14} className="shrink-0 text-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{a.company}</p>
                    <p className="truncate text-[11px] text-mute">{a.title}</p>
                  </div>
                  <Badge tone="warn">due</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* ----------------------------------------------------------- journal */}
      <Card>
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">journal</p>
            <h3 className="font-display text-lg font-bold text-ink">
              {auto.logs.length} entrée(s) — tout est horodaté
            </h3>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => auto.runCycle()} disabled={running} className="btn btn-ghost">
              <RefreshCw size={13} /> Relancer
            </button>
            <button type="button" onClick={auto.clearLogs} className="btn btn-ghost">
              <Trash2 size={13} /> Vider
            </button>
          </div>
        </div>
        {auto.logs.length === 0 ? (
          <p className="text-sm text-mute">Journal vide — lance un cycle pour démarrer le pilote.</p>
        ) : (
          <ul className="max-h-[360px] space-y-1 overflow-y-auto pr-1 font-mono text-[12px]">
            {auto.logs.slice(0, 120).map((l, i) => (
              <li key={`${l.at}-${i}`} className="flex gap-2 rounded px-2 py-1 hover:bg-elevated/50">
                <span className="shrink-0 text-mute">{hhmm(l.at)}</span>
                <span
                  className={
                    l.level === "ok"
                      ? "text-good"
                      : l.level === "warn"
                        ? "text-warn"
                        : l.level === "error"
                          ? "text-bad"
                          : "text-accent"
                  }
                >
                  [{l.scope}]
                </span>
                <span className="min-w-0 text-ink/90">{l.message}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* ---------------------------------------------------------- garde-fous */}
      <Card>
        <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-accent">
          garde-fous actifs
        </p>
        <ul className="grid gap-2 text-sm text-mute sm:grid-cols-2">
          <li>• Score minimal {rules.minScore} % avant toute mise en file.</li>
          <li>• Plafond {caps.perCycle} envoi(s)/cycle et {caps.perDay}/jour, délai {caps.delayBetweenMs} ms.</li>
          <li>• Aucune re-candidature sur un même site pendant {caps.perHostCooldownDays} jours.</li>
          <li>• Sans provider email, rien n'est envoyé : un mailto prêt est remis, le journal le dit.</li>
          <li>• Mode supervisé : aucun envoi sans ton approbation explicite.</li>
          <li>• Journal complet (collecte, scoring, envoi, relance, sécurité) horodaté.</li>
        </ul>
      </Card>
    </div>
  );
}
