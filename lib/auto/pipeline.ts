import type { Application, GeneratedAssets, JobOffer, MatchAnalysis, Profile } from "@/lib/types";
import { analyzeOffer, analyzeText } from "@/lib/ai/matcher";
import { generateAssets } from "@/lib/ai/generator";
import { generateWithLlm, llmConfigured } from "@/lib/ai/llm";
import { CITIES, SECTOR_HINTS } from "@/lib/ai/cvLexicon";
import { hasSupabase, saveApplication } from "@/lib/supabase";
import { collect, fetchOfferPageText, RawCandidate } from "./collector";
import { evaluateCandidate, hostOf, RuleHistory } from "./rules";
import { buildMailto, emailProvider, sendEmail } from "./mailer";
import type {
  AutoConfig,
  CycleReport,
  CycleRequestState,
  QueueItem,
  RelanceResult,
} from "./types";

/* ============================================================================
   PIPELINE DU PILOTE — un cycle = collecte → scoring → règles → envoi/file →
   relances dues. Tout est borné : plafonds par cycle, par jour, par hôte,
   délai entre envois. Aucun envoi n'est simulé : sans provider email, le
   cycle remet un mailto prêt à l'humain et le dit dans le journal.
   ========================================================================== */

const nowIso = () => new Date().toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () => `auto_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

function detectSector(text: string): string {
  const matches = SECTOR_HINTS.filter((h) => h.re.test(text)).map((h) => h.sector);
  if (!matches.length) return "—";
  // « plateforme », « stock »… sont ambigus : on privilégie un secteur métier
  // explicite et ne retombe sur SaaS/B2B que s'il est le seul indice.
  const specific = matches.filter((s) => s !== "SaaS / B2B");
  return specific[0] ?? "SaaS / B2B";
}

function detectCity(text: string): string {
  const lower = text.toLowerCase();
  for (const city of CITIES) {
    if (lower.includes(city.name.toLowerCase())) return `${city.name}, ${city.country}`;
  }
  return "—";
}

function detectTone(text: string): JobOffer["tone"] {
  if (/\bfond[ée]e?\b|\bstartup\b|\bscale-?up\b/i.test(text)) return "startup";
  if (/groupe|\bsa\b|actionnaires|depuis 19\d\d/i.test(text)) return "corporate";
  if (/\bapi\b|architecture|devops|senior (developer|engineer)/i.test(text)) return "technique";
  return "dynamique";
}

/** Parse « 32K – 38K € » → annualisé ; 0 si illisible. */
function parseSalary(range: string | null | undefined, fallback: number, isMax: boolean): number {
  if (!range) return fallback;
  const nums = [...range.matchAll(/(\d+(?:[.,]\d+)?)\s*k?/gi)].map((m) => {
    const v = parseFloat(m[1].replace(",", "."));
    return /k/i.test(m[0]) || v < 1000 ? Math.round(v * 1000) : Math.round(v);
  });
  if (!nums.length) return fallback;
  return isMax ? Math.max(...nums) : Math.min(...nums);
}

function extractEmail(text: string): string | undefined {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/);
  return m ? m[0] : undefined;
}

/** Lettre + objet : LLM si configuré, sinon moteur de règles local. */
async function prepareAssets(
  profile: Profile,
  offer: JobOffer,
  analysis: MatchAnalysis,
  onWarn: (msg: string) => void
): Promise<GeneratedAssets> {
  if (llmConfigured()) {
    try {
      const llm = await generateWithLlm(profile, offer, analysis);
      if (llm) {
        return {
          cvHighlights: llm.data.cvHighlights,
          cvSummary: llm.data.cvSummary,
          coverLetter: llm.data.coverLetter,
          emailSubject: llm.data.emailSubject,
          followUpEmail: llm.data.followUpEmail,
          generatedAt: nowIso(),
          engine: "llm",
          model: llm.model,
        };
      }
    } catch (err) {
      onWarn(`LLM indisponible (${err instanceof Error ? err.message : "erreur"}) → règles locales`);
    }
  }
  return generateAssets(profile, offer, analysis);
}

function offerFromText(cand: RawCandidate, text: string, profile: Profile): JobOffer {
  return {
    id: `auto_${cand.url.replace(/\W+/g, "").slice(-40) || uid()}`,
    title: cand.title,
    company: hostOf(cand.url) || "Entreprise",
    companySize: "—",
    sector: detectSector(text),
    location: detectCity(text),
    remote: "Sur site",
    contract: "CDI",
    salary: "à discuter",
    salaryMin: 0,
    salaryMax: 0,
    postedAt: nowIso(),
    source: cand.sourceLabel,
    url: cand.url,
    tone: detectTone(text),
    description: text.slice(0, 4000),
    requirements: [],
    keywords: [],
  };
}

export interface Delivery {
  item: QueueItem;
  application?: Application;
}

/** Prépare + tente l'envoi d'une offre acceptée (partagé par les 2 modes). */
async function deliver(
  offer: JobOffer,
  analysis: MatchAnalysis,
  profile: Profile,
  onWarn: (m: string) => void,
  itemId?: string
): Promise<Delivery> {
  const assets = await prepareAssets(profile, offer, analysis, onWarn);
  const email = extractEmail(`${offer.description} ${offer.url}`);
  const channel: QueueItem["channel"] = email ? "email" : "formulaire";
  const body = `${assets.coverLetter}\n\n— ${profile.fullName} · ${profile.email} · ${profile.phone}`;
  const subject = assets.emailSubject;

  let state: QueueItem["state"];
  let note: string;
  let mailto: string | undefined;

  if (email && emailProvider()) {
    const res = await sendEmail({ to: email, subject, text: body });
    if (res.ok) {
      state = "sent";
      note = `envoyé via ${res.provider}`;
    } else {
      state = "handed_off";
      note = `provider en échec (${res.error ?? "?"}) → remise humaine`;
      mailto = buildMailto(email, subject, body);
    }
  } else {
    state = "handed_off";
    note = email
      ? "mailto prêt (aucun provider email configuré)"
      : "formulaire à ouvrir (aucun email détecté sur l'offre)";
    if (email) mailto = buildMailto(email, subject, body);
  }

  const item: QueueItem = {
    id: itemId ?? uid(),
    offerId: offer.id,
    title: offer.title,
    company: offer.company,
    location: offer.location,
    contract: offer.contract,
    salary: offer.salary,
    url: offer.url,
    source: offer.source,
    channel,
    email,
    score: analysis.score,
    state,
    createdAt: nowIso(),
    decidedAt: nowIso(),
    note,
    mailto,
    text: offer.description.slice(0, 6000),
  };

  const applied = state === "sent";
  const application: Application = {
    id: uid(),
    offerId: offer.id,
    title: offer.title,
    company: offer.company,
    location: offer.location,
    contract: offer.contract,
    salary: offer.salary,
    matchScore: analysis.score,
    // handed_off → « préparation » : la candidature n'est réellement postulée
    // qu'une fois l'humain passé à l'action (ou dès l'envoi effectif).
    status: applied ? "postule" : "preparation",
    appliedAt: applied ? nowIso() : null,
    followUpAt: applied ? new Date(Date.now() + 7 * 86_400_000).toISOString() : null,
    channel,
    contactEmail: email,
    events: [
      {
        at: nowIso(),
        status: applied ? "postule" : "preparation",
        note: applied ? `Pilote automatique — ${note}` : `Pilote automatique — ${note}`,
      },
    ],
    coverLetterPreview: assets.coverLetter.slice(0, 600),
  };

  if (applied && hasSupabase) {
    await saveApplication({
      id: application.id,
      offer_id: null,
      title: application.title,
      company: application.company,
      location: application.location,
      contract: application.contract,
      salary: application.salary,
      match_score: application.matchScore,
      status: application.status,
      channel: application.channel,
      applied_at: application.appliedAt,
      follow_up_at: application.followUpAt,
      events: application.events,
      created_at: nowIso(),
    }).catch(() => undefined);
  }

  return { item, application };
}

/** Relance J+7 : brouillon toujours prêt ; envoi réel si contact + provider. */
async function buildRelance(app: Application, profile: Profile): Promise<RelanceResult> {
  const base = {
    applicationId: app.id,
    company: app.company,
    title: app.title,
  };
  const subject = `Relance — ${app.title}`;
  const text = `Bonjour,

Je me permets de revenir vers vous concernant ma candidature au poste « ${app.title} », restée sans retour de votre part.

Je reste bien entendu disponible pour un échange à votre convenance.

Cordialement,
${profile.fullName} · ${profile.email} · ${profile.phone}`;

  if (!app.contactEmail) {
    return { ...base, ok: false, note: "aucun contact email enregistré pour cette candidature" };
  }
  if (emailProvider()) {
    const res = await sendEmail({ to: app.contactEmail, subject, text });
    if (res.ok) return { ...base, ok: true, note: `relance envoyée via ${res.provider}` };
    return {
      ...base,
      ok: true,
      note: `provider en échec (${res.error ?? "?"}) → mailto prêt`,
      mailto: buildMailto(app.contactEmail, subject, text),
    };
  }
  return {
    ...base,
    ok: true,
    note: "mailto de relance prêt (aucun provider configuré)",
    mailto: buildMailto(app.contactEmail, subject, text),
  };
}

/** Approbation en mode supervisé : on rejoue la préparation sur le texte stocké. */
export async function applyQueuedItem(
  item: QueueItem,
  profile: Profile,
  onWarn: (m: string) => void
): Promise<Delivery> {
  const analysis = analyzeText(item.text, profile, item.offerId);
  const offer: JobOffer = {
    id: item.offerId,
    title: analysis.extraction.title ?? item.title,
    company: analysis.extraction.company ?? item.company,
    companySize: "—",
    sector: detectSector(item.text),
    location: item.location !== "—" ? item.location : detectCity(item.text),
    remote: analysis.extraction.remote ?? "Sur site",
    contract: analysis.extraction.contract ?? item.contract,
    salary: item.salary,
    salaryMin: 0,
    salaryMax: 0,
    postedAt: item.createdAt,
    source: item.source,
    url: item.url,
    tone: detectTone(item.text),
    description: item.text.slice(0, 4000),
    requirements: analysis.matchedKeywords,
    keywords: analysis.matchedKeywords,
  };
  if (analysis.extraction.salaryRange) {
    offer.salary = analysis.extraction.salaryRange;
    offer.salaryMin = parseSalary(analysis.extraction.salaryRange, 0, false);
    offer.salaryMax = parseSalary(analysis.extraction.salaryRange, 0, true);
  }
  return deliver(offer, analysis, profile, onWarn, item.id);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function runCycle(input: {
  config: AutoConfig;
  profile: Profile;
  state: CycleRequestState;
}): Promise<CycleReport> {
  const { config, profile } = input;
  const startedAt = nowIso();

  const report: CycleReport = {
    startedAt,
    finishedAt: "",
    mode: config.mode,
    collected: 0,
    analyzed: 0,
    accepted: 0,
    rejected: 0,
    created: [],
    applied: [],
    applications: [],
    relances: [],
    blocked: [],
    capsUsedToday: input.state.sentTodayDate === todayKey() ? input.state.sentToday : 0,
    capsPerDay: config.caps.perDay,
    errors: [],
    logs: [],
  };

  const log = (level: (typeof report.logs)[number]["level"], scope: (typeof report.logs)[number]["scope"], message: string) =>
    report.logs.push({ at: nowIso(), level, scope, message });

  log("info", "cycle", `Cycle ${config.mode === "autonomous" ? "autonome" : "supervisé"} démarré`);

  // ---------------------------------------------------------------- collecte
  const seenUrls = new Set(input.state.seenUrls);
  const history: RuleHistory = {
    seenUrls,
    queue: input.state.queue,
    applications: input.state.applications,
  };

  const candidates: RawCandidate[] = [];
  const localSeen = new Set<string>();
  const perSourceLimit = Math.max(20, config.caps.perCycle * 10);

  for (const source of config.sources.filter((s) => s.enabled)) {
    const { candidates: found, error } = await collect(source, { limit: perSourceLimit });
    if (error) {
      report.errors.push(`${source.label}: ${error}`);
      log("warn", "collecte", `${source.label} — ${error}`);
    }
    for (const c of found) {
      if (localSeen.has(c.url)) continue;
      localSeen.add(c.url);
      candidates.push(c);
    }
  }
  report.collected = candidates.length;
  log("info", "collecte", `${candidates.length} offre(s) collectée(s) sur ${config.sources.filter((s) => s.enabled).length} source(s)`);

  // ---------------------------------------------------- scoring + filtrage
  const accepted: { offer: JobOffer; analysis: MatchAnalysis }[] = [];

  for (const cand of candidates) {
    // Récupération du texte complet (catalogue : déjà en mémoire).
    let text = cand.offer?.description ?? "";
    if (!text && cand.snippet.length > 120) text = cand.snippet;
    if (!text && cand.url) {
      const page = await fetchOfferPageText(cand.url);
      if (page.ok) text = page.text.slice(0, 12_000);
      else if (page.error) log("warn", "collecte", `${cand.title.slice(0, 50)} — page illisible (${page.error})`);
    }
    if (!text) continue;

    report.analyzed += 1;
    const analysis = cand.offer
      ? analyzeOffer(cand.offer, profile)
      : analyzeText(text, profile, `auto_${report.analyzed}`);

    const offer: JobOffer =
      cand.offer ??
      (() => {
        const o = offerFromText(cand, text, profile);
        o.contract = analysis.extraction.contract ?? "CDI";
        o.remote = analysis.extraction.remote ?? "Sur site";
        if (analysis.extraction.company) o.company = analysis.extraction.company;
        if (analysis.extraction.title) o.title = analysis.extraction.title;
        const range = analysis.extraction.salaryRange;
        if (range) {
          o.salary = range;
          o.salaryMin = parseSalary(range, 0, false);
          o.salaryMax = parseSalary(range, 0, true);
        }
        return o;
      })();
    offer.description = offer.description || text.slice(0, 4000);

    const verdict = evaluateCandidate(offer, analysis, config.rules, history);
    if (verdict.accepted) {
      report.accepted += 1;
      accepted.push({ offer, analysis });
      seenUrls.add(offer.url);
    } else {
      report.rejected += 1;
      const why = verdict.reasons.map((r) => r.detail).join(" · ");
      if (report.rejected <= 6) log("info", "scoring", `${offer.company} rejetée — ${why}`);
    }
  }

  log(
    report.accepted ? "ok" : "info",
    "scoring",
    `${report.analyzed} analysée(s) → ${report.accepted} acceptée(s), ${report.rejected} rejetée(s)`
  );

  // ------------------------------------------------- plafonds + routage
  const queueHosts = input.state.queue
    .filter((q) => q.state === "sent" || q.state === "handed_off")
    .map((q) => ({ host: hostOf(q.url), at: q.createdAt }));
  const cooldownMs = config.caps.perHostCooldownDays * 86_400_000;
  const onCooldown = (url: string) => {
    const h = hostOf(url);
    if (!h) return false;
    return queueHosts.some((x) => x.host === h && Date.now() - new Date(x.at).getTime() < cooldownMs);
  };

  let sendsThisCycle = 0;
  let queueCreates = 0;
  const createLimit = config.caps.perCycle;

  for (const { offer, analysis } of accepted) {
    if (queueCreates >= createLimit) {
      log("warn", "sécurité", `Plafond par cycle atteint (${createLimit}) — offre « ${offer.title.slice(0, 40)} » reportée au prochain cycle`);
      break;
    }

    if (config.mode === "supervise") {
      const item: QueueItem = {
        id: uid(),
        offerId: offer.id,
        title: offer.title,
        company: offer.company,
        location: offer.location,
        contract: offer.contract,
        salary: offer.salary,
        url: offer.url,
        source: offer.source,
        channel: extractEmail(offer.description) ? "email" : "formulaire",
        email: extractEmail(offer.description),
        score: analysis.score,
        state: "queued",
        createdAt: nowIso(),
        note: "en attente de validation",
        text: offer.description.slice(0, 6000),
      };
      report.created.push(item);
      queueCreates += 1;
      continue;
    }

    // ------------------------------------------------------------ autonome
    if (report.capsUsedToday >= config.caps.perDay) {
      report.blocked.push({ company: offer.company, title: offer.title, reason: "plafond journalier atteint" });
      log("warn", "sécurité", `Plafond journalier (${config.caps.perDay}) atteint — « ${offer.title.slice(0, 40)} » bloquée`);
      continue;
    }
    if (sendsThisCycle >= config.caps.perCycle) {
      report.blocked.push({ company: offer.company, title: offer.title, reason: "plafond par cycle atteint" });
      continue;
    }
    if (onCooldown(offer.url)) {
      report.blocked.push({ company: offer.company, title: offer.title, reason: `cooldown ${config.caps.perHostCooldownDays} j sur ce site` });
      log("info", "sécurité", `${hostOf(offer.url)} en cooldown ${config.caps.perHostCooldownDays} j — ignorée`);
      continue;
    }

    try {
      const { item, application } = await deliver(offer, analysis, profile, (m) =>
        log("warn", "envoi", m)
      );
      report.created.push(item);
      if (item.state === "sent" || item.state === "handed_off") {
        report.applied.push(item);
        if (application) report.applications.push(application);
        sendsThisCycle += 1;
        report.capsUsedToday += 1;
        log(
          item.state === "sent" ? "ok" : "info",
          "envoi",
          `${offer.company} — ${item.note}`
        );
      }
      if (config.caps.delayBetweenMs > 0) await sleep(config.caps.delayBetweenMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "échec inconnu";
      report.errors.push(`${offer.company}: ${msg}`);
      log("error", "envoi", `${offer.company} — ${msg}`);
    }
  }

  // ----------------------------------------------------------- relances
  if (config.autoRelance) {
    const due = input.state.applications
      .filter(
        (a) =>
          a.status === "postule" &&
          a.followUpAt &&
          new Date(a.followUpAt).getTime() <= Date.now()
      )
      .sort((a, b) => new Date(a.followUpAt!).getTime() - new Date(b.followUpAt!).getTime())
      .slice(0, config.caps.relancesPerCycle);

    for (const app of due) {
      try {
        const relance = await buildRelance(app, profile);
        report.relances.push(relance);
        log(relance.ok ? "ok" : "warn", "relance", `${app.company} — ${relance.note}`);
      } catch (err) {
        report.errors.push(`relance ${app.company}: ${err instanceof Error ? err.message : "erreur"}`);
        log("error", "relance", `${app.company} — échec de la relance`);
      }
    }
    if (due.length) log("info", "relance", `${due.length} relance(s) J+7 traitée(s)`);
  }

  report.finishedAt = nowIso();
  log(
    "info",
    "cycle",
    `Cycle terminé — ${report.created.length} en file, ${report.applied.length} remis/envoyés, ${report.relances.length} relance(s)`
  );
  return report;
}
