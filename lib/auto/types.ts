/* ============================================================================
   AUTOMATISATION — modèle de données du pilote automatique
   Deux modes cohabitent :
   - "supervise"  : collecte + scoring + file d'attente, l'humain valide.
   - "autonomous" : envoi automatique sous plafonds, relances automatiques.
   ========================================================================== */

import type {
  Application,
  ContractType,
  RemoteMode,
} from "@/lib/types";

export type AutoMode = "supervise" | "autonomous";

export type AutoSourceKind = "catalogue" | "rss" | "list";

export interface AutoSource {
  id: string;
  label: string;
  kind: AutoSourceKind;
  /** URL du flux RSS ou de la page de liste (inutile pour le catalogue). */
  url: string;
  enabled: boolean;
}

export type RejectionReason =
  | "blacklist"
  | "duplicate"
  | "score"
  | "sector"
  | "contract"
  | "location"
  | "remote"
  | "salary";

export interface RuleVerdict {
  accepted: boolean;
  reasons: { reason: RejectionReason; detail: string }[];
}

/** Règles strictes appliquées à chaque offre collectée. */
export interface AutoRules {
  minScore: number;
  /** Secteurs admis (vide = tous). */
  sectors: string[];
  /** Contrats admis (vide = tous). */
  contracts: ContractType[];
  /** Jetons de ville admis, ex. "Bruxelles" (vide = toutes). */
  locations: string[];
  /** Modes de travail admis (vide = tous). */
  remote: RemoteMode[];
  /** Salaire annuel maximum minimal (0 = ignore ; ignore si offre sans salaire). */
  salaryMin: number;
  /** Sous-chaînes interdites sur l'entreprise ou l'hôte (ex. "viafoura"). */
  blacklist: string[];
}

/** Plafonds de sécurité : jamais de course ni de spam. */
export interface AutoCaps {
  perCycle: number;
  perDay: number;
  perHostCooldownDays: number;
  delayBetweenMs: number;
  relancesPerCycle: number;
}

export interface AutoConfig {
  mode: AutoMode;
  /** Planificateur client : exécute un cycle toutes les `intervalMin` minutes. */
  schedulerOn: boolean;
  intervalMin: number;
  /** Relances J+7 automatiques (dans les limites de `relancesPerCycle`). */
  autoRelance: boolean;
  sources: AutoSource[];
  rules: AutoRules;
  caps: AutoCaps;
}

export type QueueState =
  | "queued" // supervisé : en attente de validation
  | "sent" // envoyé réellement (provider email configuré)
  | "handed_off" // remis à l'humain : mailto / lien de formulaire prêt
  | "failed"
  | "rejected"
  | "blocked"; // plafond ou règle de sécurité atteint

export interface QueueItem {
  id: string;
  offerId: string;
  title: string;
  company: string;
  location: string;
  contract: ContractType;
  salary: string;
  url: string;
  source: string;
  channel: "email" | "formulaire";
  email?: string;
  score: number;
  state: QueueState;
  createdAt: string;
  decidedAt?: string;
  /** Motif (rejet / blocage) ou détail d'envoi (provider utilisé). */
  note?: string;
  error?: string;
  /** Prêt-à-envoyer : mailto construit pour l'humain. */
  mailto?: string;
  /** Extrait du texte d'offre pour regénérer la lettre à l'approbation. */
  text: string;
}

export interface AutoLogEntry {
  at: string;
  level: "info" | "ok" | "warn" | "error";
  scope: "collecte" | "scoring" | "envoi" | "relance" | "sécurité" | "cycle";
  message: string;
}

export interface RelanceResult {
  applicationId: string;
  company: string;
  title: string;
  ok: boolean;
  note: string;
  mailto?: string;
}

/** État transmis par le client à chaque cycle (source de vérité locale). */
export interface CycleRequestState {
  queue: QueueItem[];
  /** URLs déjà rencontrées (offres + candidatures). */
  seenUrls: string[];
  applications: Application[];
  /** Nombre d'envois déjà effectués aujourd'hui (reset à minuit). */
  sentToday: number;
  sentTodayDate: string;
}

export interface CycleReport {
  startedAt: string;
  finishedAt: string;
  mode: AutoMode;
  collected: number;
  analyzed: number;
  accepted: number;
  rejected: number;
  /** Nouveaux items de file créés par ce cycle. */
  created: QueueItem[];
  /** Items envoyés/remis pendant ce cycle (mode autonome). */
  applied: QueueItem[];
  /** Candidatures à insérer dans le pipeline. */
  applications: Application[];
  relances: RelanceResult[];
  blocked: { company: string; title: string; reason: string }[];
  capsUsedToday: number;
  capsPerDay: number;
  errors: string[];
  logs: AutoLogEntry[];
}

export const DEFAULT_AUTO_CONFIG: AutoConfig = {
  mode: "supervise",
  schedulerOn: false,
  intervalMin: 30,
  autoRelance: true,
  sources: [
    {
      id: "catalogue",
      label: "Catalogue ApplyForge",
      kind: "catalogue",
      url: "",
      enabled: true,
    },
  ],
  rules: {
    minScore: 75,
    sectors: [],
    contracts: [],
    locations: [],
    remote: [],
    salaryMin: 0,
    blacklist: [],
  },
  caps: {
    perCycle: 5,
    perDay: 10,
    perHostCooldownDays: 14,
    delayBetweenMs: 800,
    relancesPerCycle: 5,
  },
};
