import type { ActivityPoint, Application } from "@/lib/types";
import { profile } from "@/lib/mock/profile";

const DAY = 1000 * 60 * 60 * 24;
const dayKey = (d: Date | string) => new Date(d).toISOString().slice(0, 10);
const iso = (offsetDays: number) =>
  new Date(Date.now() - offsetDays * DAY).toISOString();

const ev = (offsetDays: number, status: Application["status"], note: string) => ({
  at: iso(offsetDays),
  status,
  note,
});

export const initialApplications: Application[] = [
  {
    id: "app_01",
    offerId: "job_06",
    title: "Chargé de commande & picking — Plateforme Logistique Liège Airport",
    company: "CargoFlow",
    location: "Liège, Belgique · Sur site",
    contract: "CDD",
    salary: "26k – 29k €",
    matchScore: 87,
    status: "entretien",
    appliedAt: iso(14),
    followUpAt: iso(7),
    channel: "formulaire",
    events: [
      ev(14, "postule", "Candidature envoyée via le formulaire CargoFlow"),
      ev(7, "relance", "Relance J+7 envoyée — réponse le jour même"),
      ev(6, "entretien", "Premier entretien planifié"),
    ],
    coverLetterPreview:
      "Bonjour l'équipe CargoFlow, picking, WMS, préparation de commandes...",
  },
  {
    id: "app_02",
    offerId: "job_02",
    title: "Chargé·e d'application logistique (WMS) — Centre de distribution Anvers",
    company: "PortLink Logistics",
    location: "Anvers, Belgique · Sur site",
    contract: "CDI",
    salary: "36k – 44k €",
    matchScore: 91,
    status: "postule",
    appliedAt: iso(3),
    followUpAt: iso(-4),
    channel: "quick-grabber",
    events: [
      ev(3, "postule", "Postulation 1-click depuis Quick Grabber"),
    ],
  },
  {
    id: "app_03",
    offerId: "job_03",
    title: "Chargé·e marketing & développement commercial (Health) — Laboratoires Vitae",
    company: "Laboratoires Vitae",
    location: "Liège, Belgique · Hybride",
    contract: "CDI",
    salary: "38k – 46k €",
    matchScore: 78,
    status: "relance",
    appliedAt: iso(9),
    followUpAt: iso(2),
    channel: "email",
    events: [
      ev(9, "postule", "Envoyée par email au responsable commercial"),
      ev(2, "relance", "Relance J+7 envoyée — en attente de réponse"),
    ],
  },
  {
    id: "app_05",
    offerId: "job_07",
    title: "Responsable d'accueil et de l'onboarding client — Copropriété&Co",
    company: "Copropriété&Co",
    location: "Ixelles, Belgique · Sur site",
    contract: "CDI",
    salary: "34k – 40k €",
    matchScore: 85,
    status: "entretien",
    appliedAt: iso(21),
    followUpAt: iso(14),
    channel: "email",
    events: [
      ev(21, "postule", "Candidature spontanée par email"),
      ev(14, "relance", "Relance J+7 — prise de contact téléphonique"),
      ev(11, "entretien", "Entretien avec le responsable administratif"),
    ],
  },
  {
    id: "app_06",
    offerId: "job_01",
    title: "Chargé de gestion des réceptions — Entrepôt de Bruxelles-Midi",
    company: "Transcargo Terminals",
    location: "Bruxelles, Belgique · Sur site",
    contract: "CDI",
    salary: "32k – 38k €",
    matchScore: 72,
    status: "refus",
    appliedAt: iso(26),
    followUpAt: iso(19),
    channel: "formulaire",
    events: [
      ev(26, "postule", "Candidature envoyée"),
      ev(19, "relance", "Relance J+7"),
      ev(16, "refus", "Réponse : profil trop senior pour le poste"),
    ],
  },
  {
    id: "app_08",
    offerId: "job_05",
    title: "Chargé·e de sécurité privée — Site industriel Infrabel Ligne 33",
    company: "GardeLink Sécurité",
    location: "Charleroi, Belgique · Sur site",
    contract: "CDI",
    salary: "30k – 34k €",
    matchScore: 78,
    status: "relance",
    appliedAt: iso(8),
    followUpAt: iso(1),
    channel: "email",
    events: [
      ev(8, "postule", "Envoyée au responsable recrutement"),
      ev(1, "relance", "Relance J+7 envoyée hier"),
    ],
  },
  {
    id: "app_09",
    offerId: "job_08",
    title: "Chargé·e d'accueil événementiel & foires — Expo Palace Bruxelles",
    company: "Expo Palace",
    location: "Bruxelles, Belgique · Sur site",
    contract: "CDD",
    salary: "24k – 27k €",
    matchScore: 79,
    status: "postule",
    appliedAt: iso(5),
    followUpAt: iso(-2),
    channel: "formulaire",
    events: [ev(5, "postule", "Candidature envoyée + lettre générée")],
  },
  {
    id: "app_10",
    offerId: "job_12",
    title: "Responsable commercial & partenariats — Gym Fitness First Belgique",
    company: "Fitness First Belgique",
    location: "Etterbeek, Belgique · Sur site",
    contract: "CDI",
    salary: "40k – 50k € + variable",
    matchScore: 82,
    status: "accepte",
    appliedAt: iso(38),
    followUpAt: iso(31),
    channel: "email",
    events: [
      ev(38, "postule", "Candidature envoyée"),
      ev(31, "relance", "Relance J+7"),
      ev(24, "entretien", "Entretien commercial validé"),
      ev(9, "entretien", "Entretien final avec le directeur"),
      ev(4, "accepte", "Offre reçue — 45k € + variable, à négocier"),
    ],
  },
  {
    id: "app_11",
    offerId: "job_09",
    title: "Chargé·e d'animation socioculturelle — Maison de quartier Molenbeek",
    company: "Culture & Citoyenneté ASBL",
    location: "Molenbeek-Saint-Jean, Belgique · Sur site",
    contract: "CDD",
    salary: "28k – 32k €",
    matchScore: 85,
    status: "relance",
    appliedAt: iso(7),
    followUpAt: iso(0),
    channel: "quick-grabber",
    events: [
      ev(7, "postule", "Postulation 1-click via Quick Grabber"),
      ev(0, "relance", "Relance programmée pour aujourd'hui"),
    ],
  },
  {
    id: "app_13",
    offerId: "job_10",
    title: "Chargé·e d'animation jeunes publics — Parc de jeux de Flagey",
    company: "Commune de Bruxelles-Ville",
    location: "Bruxelles-Ville, Belgique · Sur site",
    contract: "CDI",
    salary: "33k – 39k €",
    matchScore: 82,
    status: "preparation",
    appliedAt: null,
    followUpAt: null,
    channel: "quick-grabber",
    events: [ev(0, "preparation", "Générée par 1-Click Prep — en attente d'envoi")],
  },
];

/** Série d'activité sur 30 jours générée depuis les vraies candidatures.
   Chaque candidature envoyée/entretien/réponse est distribuée sur sa date réelle
   et comptabilisée dans la courbe du jour concerné. */
export function buildActivityWindow(days = 30): ActivityPoint[] {
  const windowStart = new Date(Date.now() - days * DAY);
  const buckets = new Map<string, ActivityPoint>();
  for (let d = 0; d < days; d++) {
    const date = new Date(Date.now() - d * DAY);
    const key = dayKey(date);
    buckets.set(key, { date: key, sent: 0, replies: 0, interviews: 0 });
  }
  for (const app of initialApplications) {
    if (!app.appliedAt) continue;
    const applied = new Date(app.appliedAt);
    if (applied >= windowStart) {
      const key = dayKey(applied);
      const bucket = buckets.get(key);
      if (bucket) bucket.sent += 1;
    }
    for (const ev of app.events) {
      const at = new Date(ev.at);
      if (at < windowStart) continue;
      const key = dayKey(at);
      const bucket = buckets.get(key);
      if (!bucket) continue;
      if (ev.status === "entretien") bucket.interviews += 1;
      if (ev.status === "relance" || ev.status === "refus" || ev.status === "accepte") bucket.replies += 1;
    }
  }
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(Date.now() - i * DAY);
    const key = dayKey(date);
    const point = buckets.get(key) ?? { date: key, sent: 0, replies: 0, interviews: 0 };
    return { date: key, sent: point.sent, replies: point.replies, interviews: point.interviews };
  }).reverse();
}

export const activity = buildActivityWindow(30);

export const profileStats = {
  applicationsTotal: initialApplications.length + 21,
  base: profile,
};
