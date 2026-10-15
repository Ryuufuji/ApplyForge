"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Flame,
  Send,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ActivityChart, BarList, DonutChart, Sparkline } from "@/components/charts";
import { Badge, Card, Counter, ScoreRing, SectionHeader } from "@/components/ui";
import {
  PIPELINE,
  STATUS_META,
  bucketActivity,
  computeStats,
  daysSince,
  formatRelative,
  isFollowUpDue,
  sectorBreakdown,
} from "@/lib/analytics";
import { offers } from "@/lib/mock/offers";
import { analyzeOffer } from "@/lib/ai/matcher";
import { useApp } from "@/lib/store";

const STATUS_COLORS: Record<string, string> = {
  preparation: "rgb(var(--c-mute))",
  postule: "rgb(var(--c-accent))",
  relance: "rgb(var(--c-warn))",
  entretien: "rgb(var(--c-alt))",
  refus: "rgb(var(--c-bad))",
  accepte: "rgb(var(--c-good))",
};

export default function DashboardPage() {
  const { applications, profile, setStatus, toast } = useApp();
  const stats = computeStats(applications);
  const buckets = bucketActivity(3);
  const recent = [...applications]
    .sort((a, b) => (b.events.at(-1)?.at ?? "").localeCompare(a.events.at(-1)?.at ?? ""))
    .slice(0, 6);
  const dueList = applications.filter((a) => isFollowUpDue(a.followUpAt, a.status));
  const hotOffers = offers.filter((o) => analyzeOffer(o, profile).score >= 80).length;

  const cards = [
    {
      key: "sent",
      label: "Candidatures envoyées",
      value: stats.sent,
      suffix: "",
      delta: stats.deltaSent,
      icon: Send,
      spark: [4, 6, 5, 8, 7, 9, 11, 10, 12],
      hint: "sur les 30 derniers jours",
    },
    {
      key: "follow",
      label: "Relances à faire",
      value: stats.followUpsDue,
      suffix: "",
      delta: stats.deltaFollowUps,
      icon: CalendarClock,
      spark: [2, 3, 2, 4, 3, 2, 3, 4, 3],
      hint: "deadline J+7 atteinte",
      invert: true,
    },
    {
      key: "rate",
      label: "Taux de retour",
      value: stats.replyRate,
      suffix: "%",
      delta: stats.deltaReplyRate,
      icon: TrendingUp,
      spark: [8, 11, 10, 14, 16, 15, 19, 21, 24],
      hint: "réponses reçues / envoyées",
    },
    {
      key: "itw",
      label: "Entretiens en cours",
      value: stats.interviews,
      suffix: "",
      delta: stats.deltaInterviews,
      icon: Target,
      spark: [0, 1, 1, 2, 1, 2, 3, 2, 3],
      hint: "process actifs",
    },
  ];

  const pipelineData = PIPELINE.map((s) => ({
    name: STATUS_META[s].label,
    value: applications.filter((a) => a.status === s).length,
    color: STATUS_COLORS[s],
  })).filter((d) => d.value > 0);

  const sectors = sectorBreakdown(applications).slice(0, 5);

  return (
    <div className="space-y-8">
      {/* ---------------------------------------------------------- HERO */}
      <section className="relative overflow-hidden rounded-2xl border border-line/50 bg-surface/50 px-5 py-7 backdrop-blur-sm sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-alt/10 blur-3xl" />

        <div className="relative grid items-end gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-accent">
              Session du{" "}
              {new Date().toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Salut {profile.fullName.split(" ")[0]} —{" "}
              <span className="text-gradient">{stats.followUpsDue} relances</span> à déclencher,{" "}
              {stats.sent} candidatures actives.
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-mute sm:text-base">
              {profile.headline} · Compatibility moyenne du pipeline :{" "}
              <span className="font-semibold text-ink">{stats.avgMatch} %</span>
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Link href="/offres" className="btn btn-primary">
                <Zap size={15} /> Analyser une offre
              </Link>
              <Link href="/relances" className="btn btn-ghost">
                <CalendarClock size={15} /> Voir les relances ({dueList.length})
              </Link>
              <Link href="/candidatures" className="btn btn-ghost">
                Pipeline <ArrowRight size={15} />
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-5 justify-self-start rounded-xl border border-line/50 bg-elevated/50 px-5 py-4 lg:justify-self-end">
            <ScoreRing score={stats.avgMatch} size={92} label="match moyen" />
            <div className="space-y-2.5">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-mute">Offres du jour</p>
                <p className="font-display text-xl font-bold text-ink">
                  {offers.filter((o) => daysSince(o.postedAt) <= 1).length}
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-widest text-mute">Match ≥ 80 %</p>
                <p className="font-display text-xl font-bold text-good">{hotOffers}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- STATS */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c, i) => {
          const good = c.invert ? c.delta <= 0 : c.delta >= 0;
          return (
            <Card key={c.key} delay={i * 0.06} hover className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-mute">{c.label}</p>
                  <p className="mt-2 font-display text-4xl font-bold tracking-tight text-ink">
                    <Counter to={c.value} suffix={c.suffix} />
                  </p>
                </div>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent ring-1 ring-accent/30">
                  <c.icon size={17} />
                </span>
              </div>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${
                      good ? "bg-good/12 text-good" : "bg-bad/12 text-bad"
                    }`}
                  >
                    {c.delta >= 0 ? <ArrowUpRight size={11} /> : null}
                    {c.delta > 0 ? "+" : ""}
                    {c.delta}
                  </span>
                  <p className="mt-1.5 text-[11px] text-mute">{c.hint}</p>
                </div>
                <Sparkline points={c.spark} className="opacity-80" />
              </div>
            </Card>
          );
        })}
      </section>

      {/* -------------------------------------------- GRAPHIQUES */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card delay={0.15} className="p-5 lg:col-span-2">
          <SectionHeader
            index="01 / activité"
            title="Courrier de candidature"
            subtitle="Volume envoyé (aire) et réponses reçues (barres) sur 30 jours."
            action={
              <div className="flex items-center gap-3 text-[11px] text-mute">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm bg-accent" /> envoyées
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm bg-alt" /> réponses
                </span>
              </div>
            }
          />
          <ActivityChart data={buckets} />
        </Card>

        <Card delay={0.22} className="p-5">
          <SectionHeader index="02 / pipeline" title="Répartition" />
          <DonutChart
            data={pipelineData}
            centerValue={`${applications.length}`}
            centerLabel="candidatures suivies"
            size={150}
            thickness={15}
          />
        </Card>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Relances prioritaires */}
        <Card delay={0.28} className="p-5">
          <SectionHeader
            index="03 / relances"
            title="À traiter maintenant"
            action={
              <Link href="/relances" className="text-xs font-semibold text-accent hover:underline">
                Tout voir
              </Link>
            }
          />
          {dueList.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line/70 px-3 py-6 text-center text-sm text-mute">
              Aucune relance due — tu es à jour. 🎯
            </p>
          ) : (
            <ul className="space-y-2.5">
              {dueList.slice(0, 4).map((a, i) => (
                <motion.li
                  key={a.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.35 + i * 0.07 }}
                  className="flex items-center gap-3 rounded-lg border border-line/50 bg-elevated/40 p-3"
                >
                  <span className="h-8 w-1 shrink-0 rounded-full bg-warn" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{a.company}</p>
                    <p className="truncate text-[11px] text-mute">
                      {a.title.slice(0, 42)} · {formatRelative(a.followUpAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStatus(a.id, "relance", "Relance envoyée depuis le dashboard");
                      toast({ title: `Relance envoyée à ${a.company}`, body: "J+7 repoussé, statut mis à jour." });
                    }}
                    className="btn btn-ghost !px-2.5 !py-1.5 !text-[11px]"
                  >
                    Relancer
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </Card>

        {/* Top secteurs */}
        <Card delay={0.34} className="p-5">
          <SectionHeader index="04 / ciblage" title="Secteurs visés" />
          <BarList data={sectors.map((s) => ({ ...s, hint: `${s.value} cand.` }))} />
        </Card>

        {/* Funnel */}
        <Card delay={0.4} className="p-5">
          <SectionHeader index="05 / entonnoir" title="Conversion" />
          <FunnelRow label="Envoyées" value={applications.filter((a) => a.appliedAt).length} total={applications.length} />
          <FunnelRow label="Réponses" value={applications.filter((a) => a.events.some((e) => ["relance", "entretien", "refus", "accepte"].includes(e.status))).length} total={applications.length} delay={0.1} />
          <FunnelRow label="Entretiens" value={stats.interviews} total={applications.length} delay={0.2} />
          <FunnelRow label="Offres" value={stats.offers} total={applications.length} delay={0.3} />
        </Card>
      </section>

      {/* ------------------------------------------- ACTIVITÉ RÉCENTE */}
      <section>
        <SectionHeader
          index="06 / historique"
          title="Dernières candidatures"
          subtitle="Chaque changement de statut est horodaté dans le journal."
          action={
            <Link href="/candidatures" className="btn btn-ghost !py-2 text-xs">
              Ouvrir le pipeline <ArrowRight size={14} />
            </Link>
          }
        />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {recent.map((a, i) => {
            const meta = STATUS_META[a.status];
            const last = a.events.at(-1);
            return (
              <Card key={a.id} delay={0.05 * i} hover className="flex flex-col p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-display text-sm font-bold text-ink">{a.company}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-mute">{a.title}</p>
                  </div>
                  <ScoreRing score={a.matchScore} size={54} stroke={5} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone={a.status === "accepte" ? "good" : a.status === "refus" ? "bad" : a.status === "relance" ? "warn" : a.status === "entretien" ? "alt" : "accent"}>
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </Badge>
                  <Badge>{a.contract}</Badge>
                  {a.salary && <Badge>{a.salary}</Badge>}
                </div>
                <p className="mt-3 border-t border-line/40 pt-3 text-[11px] leading-relaxed text-mute">
                  <Flame size={11} className="mr-1 inline text-accent" />
                  {last?.note ?? "—"} · {formatRelative(last?.at ?? null)}
                </p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------- CTA RAPIDES */}
      <Card delay={0.2} className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-5 p-6">
          <div className="flex items-center gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-accent-gradient shadow-glow">
              <Zap size={22} className="text-accent-contrast" />
            </span>
            <div>
              <p className="font-display text-lg font-bold text-ink">Quick Grabber</p>
              <p className="text-sm text-mute">
                Colle un lien ou le texte d'une offre → analyse, lettre et envoi en 1 clic.
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <a href="#quick-grabber" className="btn btn-primary">
              <Zap size={15} /> Ouvrir (⌘K)
            </a>
            <Link href="/profil" className="btn btn-ghost">
              <CheckCircle2 size={15} /> Base master
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}

function FunnelRow({
  label,
  value,
  total,
  delay = 0,
}: {
  label: string;
  value: number;
  total: number;
  delay?: number;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-mute">{label}</span>
        <span className="font-mono font-semibold text-ink">
          {value} <span className="text-mute">/ {pct}%</span>
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-line/40">
        <motion.div
          initial={{ width: 0 }}
          whileInView={{ width: `${pct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
          className="h-full rounded-full bg-accent-gradient"
        />
      </div>
    </div>
  );
}
