import type {
  ApplicationStatus,
  ContractType,
  DashboardStats,
  RemoteMode,
} from "@/lib/types";
import { activity, initialApplications } from "@/lib/mock/applications";

/** Statut -> libellé, couleur Tailwind, position dans le pipeline. */
export const STATUS_META: Record<
  ApplicationStatus,
  {
    label: string;
    short: string;
    color: string; // classe "text-…"
    dot: string; // classe "bg-…"
    ring: string;
    desc: string;
  }
> = {
  preparation: {
    label: "Préparation",
    short: "Prép.",
    color: "text-mute",
    dot: "bg-mute",
    ring: "ring-mute/40",
    desc: "Candidature générée, pas encore envoyée",
  },
  postule: {
    label: "Postulé",
    short: "Postulé",
    color: "text-accent",
    dot: "bg-accent",
    ring: "ring-accent/40",
    desc: "Envoyée, en attente de retour",
  },
  relance: {
    label: "Relance",
    short: "Relance",
    color: "text-warn",
    dot: "bg-warn",
    ring: "ring-warn/40",
    desc: "Relance à envoyer ou envoyée",
  },
  entretien: {
    label: "Entretien",
    short: "Entretien",
    color: "text-alt",
    dot: "bg-alt",
    ring: "ring-alt/40",
    desc: "Process en cours",
  },
  refus: {
    label: "Refus",
    short: "Refus",
    color: "text-bad",
    dot: "bg-bad",
    ring: "ring-bad/40",
    desc: "Candidature close",
  },
  accepte: {
    label: "Accepté",
    short: "Accepté",
    color: "text-good",
    dot: "bg-good",
    ring: "ring-good/40",
    desc: "Offre reçue",
  },
};

export const PIPELINE: ApplicationStatus[] = [
  "preparation",
  "postule",
  "relance",
  "entretien",
  "refus",
  "accepte",
];

export const CHANNEL_META: Record<string, { label: string; icon: string }> = {
  email: { label: "Email", icon: "mail" },
  formulaire: { label: "Formulaire", icon: "form" },
  "quick-grabber": { label: "Quick Grabber", icon: "zap" },
  linkedin: { label: "LinkedIn", icon: "linkedin" },
};

export const CONTRACTS: ContractType[] = [
  "CDI",
  "CDD",
  "Freelance",
  "Stage",
  "Alternance",
  "Temps partiel",
];

export const REMOTE_MODES: RemoteMode[] = ["Sur site", "Hybride", "Remote"];

const DAY = 86_400_000;
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function isFollowUpDue(followUpAt: string | null, status: ApplicationStatus) {
  if (!followUpAt) return false;
  if (status === "refus" || status === "accepte" || status === "entretien") return false;
  return new Date(followUpAt).getTime() <= Date.now();
}

export function daysSince(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

export function daysUntil(iso: string | null) {
  if (!iso) return Infinity;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DAY);
}

export function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const d = Math.round((new Date(iso).getTime() - Date.now()) / DAY);
  if (d === 0) return "aujourd'hui";
  if (d === 1) return "demain";
  if (d === -1) return "hier";
  if (d < 0) return `il y a ${Math.abs(d)} j`;
  return `dans ${d} j`;
}

export function computeStats(
  apps: (typeof initialApplications)[number][]
): DashboardStats {
  const sent = apps.filter((a) => a.appliedAt).length;
  const replies = apps.filter((a) =>
    a.events.some((e) => e.status === "entretien" || e.status === "accepte" || e.status === "refus")
  ).length;
  const interviews = apps.filter(
    (a) => a.status === "entretien" || a.status === "accepte"
  ).length;
  const offers = apps.filter((a) => a.status === "accepte").length;
  const followUpsDue = apps.filter((a) => isFollowUpDue(a.followUpAt, a.status)).length;

  const thisWeekSent = apps.filter(
    (a) => a.appliedAt && Date.now() - new Date(a.appliedAt).getTime() < 7 * DAY
  ).length;
  const lastWeekSent = apps.filter((a) => {
    if (!a.appliedAt) return false;
    const age = Date.now() - new Date(a.appliedAt).getTime();
    return age >= 7 * DAY && age < 14 * DAY;
  }).length;

  const avgMatch = sent
    ? Math.round(
        apps.filter((a) => a.appliedAt).reduce((s, a) => s + a.matchScore, 0) / sent
      )
    : 0;

  return {
    sent,
    followUpsDue,
    replyRate: sent ? Math.round((replies / sent) * 100) : 0,
    interviews,
    offers,
    avgMatch,
    deltaSent: thisWeekSent - lastWeekSent,
    deltaReplyRate: replies > sent ? 0 : sent > 0 ? Math.round(((replies + 1) / (sent + 1)) * 100 - (replies / sent) * 100) : 0,
    deltaInterviews: interviews > 0 ? 0 : 0,
    deltaFollowUps: followUpsDue - Math.max(0, apps.length - followUpsDue - sent),
  };
}

/** Agrège la série d'activité en buckets de `bucketDays` jours. */
export function bucketActivity(bucketDays = 3) {
  const buckets: { label: string; sent: number; replies: number; interviews: number }[] = [];
  for (let i = 0; i < activity.length; i += bucketDays) {
    const slice = activity.slice(i, i + bucketDays);
    buckets.push({
      label: dayKey(new Date(slice[0].date)).slice(5),
      sent: slice.reduce((s, p) => s + p.sent, 0),
      replies: slice.reduce((s, p) => s + p.replies, 0),
      interviews: slice.reduce((s, p) => s + p.interviews, 0),
    });
  }
  return buckets;
}

/** Répartition des candidatures par secteur (top du pipeline). */
export function sectorBreakdown(apps: { company: string }[]) {
  const map = new Map<string, number>();
  const sectorOf = (company: string) => {
    const table: Record<string, string> = {
      "Transcargo Terminals": "Logistique",
      "PortLink Logistics": "Logistique",
      CargoFlow: "Logistique",
      "Laboratoires Vitae": "Vente",
      "Monceau Beauté": "Vente",
      "Fitness First Belgique": "Vente",
      "GardeLink Sécurité": "Sécurité",
      SecurFest: "Sécurité",
      "Copropriété&Co": "Accueil",
      "Expo Palace": "Accueil",
      "Culture & Citoyenneté ASBL": "Animation",
      "Commune de Bruxelles-Ville": "Animation",
    };
    return table[company] ?? "Autre";
  };
  apps.forEach((a) => {
    const s = sectorOf(a.company);
    map.set(s, (map.get(s) ?? 0) + 1);
  });
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}
