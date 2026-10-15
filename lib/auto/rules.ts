import type { Application, JobOffer, MatchAnalysis } from "@/lib/types";
import type { AutoRules, QueueItem, RuleVerdict } from "./types";

/* ============================================================================
   MOTEUR DE RÈGLES — filtre strict appliqué à chaque offre collectée.
   Chaque refus porte un motif explicite : rien ne se perd sans explication
   dans le journal du pilote.
   ========================================================================== */

export type Candidate = Pick<
  JobOffer,
  "title" | "company" | "sector" | "location" | "contract" | "remote" | "salaryMax" | "url"
>;

export interface RuleHistory {
  seenUrls: Set<string>;
  queue: QueueItem[];
  applications: Application[];
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const UNKNOWN = (s: string) => !s || s.trim() === "" || s.trim() === "—";

export function evaluateCandidate(
  offer: Candidate,
  analysis: MatchAnalysis,
  rules: AutoRules,
  history: RuleHistory
): RuleVerdict {
  const reasons: RuleVerdict["reasons"] = [];
  const push = (reason: RuleVerdict["reasons"][number]["reason"], detail: string) =>
    reasons.push({ reason, detail });

  // 1. Liste noire — entreprise ou hôte de l'URL.
  const host = hostOf(offer.url);
  for (const token of rules.blacklist) {
    const t = norm(token.trim());
    if (!t) continue;
    if (norm(offer.company).includes(t) || norm(offer.title).includes(t) || host.includes(t)) {
      push("blacklist", `« ${token.trim()} » sur liste noire`);
      break;
    }
  }

  // 2. Doublon — URL déjà vue, en file, ou déjà postulée.
  if (offer.url && history.seenUrls.has(offer.url)) {
    push("duplicate", "URL déjà traitée");
  } else {
    const key = `${norm(offer.title)}|${norm(offer.company)}`;
    const inQueue = history.queue.some(
      (q) => q.state !== "rejected" && `${norm(q.title)}|${norm(q.company)}` === key
    );
    const applied = history.applications.some(
      (a) => `${norm(a.title)}|${norm(a.company)}` === key
    );
    if (inQueue || applied) push("duplicate", "Candidature déjà enregistrée");
  }

  // 3. Score minimal.
  if (analysis.score < rules.minScore) {
    push("score", `${analysis.score} % < ${rules.minScore} % requis`);
  }

  // 4. Secteur (ignoré si l'offre ne déclare pas son secteur).
  if (rules.sectors.length && !UNKNOWN(offer.sector)) {
    const s = norm(offer.sector);
    if (!rules.sectors.some((allowed) => s.includes(norm(allowed)) || norm(allowed).includes(s))) {
      push("sector", `secteur « ${offer.sector} » hors critères`);
    }
  }

  // 5. Contrat.
  if (rules.contracts.length && !rules.contracts.includes(offer.contract)) {
    push("contract", `${offer.contract} non recherché`);
  }

  // 6. Localisation (refus aussi si la ville est inconnue : critère strict).
  if (rules.locations.length) {
    const loc = norm(offer.location);
    if (UNKNOWN(offer.location)) {
      push("location", "localisation inconnue sur l'offre");
    } else if (!rules.locations.some((city) => loc.includes(norm(city)))) {
      push("location", `« ${offer.location} » hors zone`);
    }
  }

  // 7. Mode de travail.
  if (rules.remote.length && !rules.remote.includes(offer.remote)) {
    push("remote", `${offer.remote} non recherché`);
  }

  // 8. Salaire plancher (seul si l'offre annonce un maximum).
  if (rules.salaryMin > 0 && offer.salaryMax > 0 && offer.salaryMax < rules.salaryMin) {
    push("salary", `plafond ${offer.salaryMax} € < ${rules.salaryMin} €`);
  }

  return { accepted: reasons.length === 0, reasons };
}
