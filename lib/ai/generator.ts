import type {
  GeneratedAssets,
  JobOffer,
  MatchAnalysis,
  Profile,
} from "@/lib/types";
import { LANGUAGE_NAMES } from "@/lib/ai/cvLexicon";

/** Compétences « métier » : une langue n'est jamais une preuve de réalisation. */
const professionalSkills = (profile: Profile) =>
  profile.skills.filter((s) => !LANGUAGE_NAMES.has(s.name));

/* ============================================================================
   1-CLICK PREP — génération sur-mesure du CV, de la lettre et de la relance.
   Implémentation "rules" (toujours disponible) + appel LLM si une clé est
   configurée (cf. lib/ai/llm.ts et app/api/generate/route.ts).
   ========================================================================== */

const TONE_OPENERS: Record<JobOffer["tone"], [string, string]> = {
  corporate: [
    "C'est avec un vif intérêt que je vous adresse ma candidature",
    "Vos équipes construisent depuis plusieurs années une plateforme reconnue, et c'est précisément la maturité de votre produit qui motive ma candidature",
  ],
  startup: [
    "Je souhaite rejoindre votre aventure, et voici pourquoi",
    "Votre trajectoire en série A et la clarté du problème que vous résolvez ont immédiatement convaincu ma démarche",
  ],
  technique: [
    "Les contraintes techniques décrites dans votre offre correspondent exactement au terrain sur lequel je progresse depuis %YEARS% ans",
    "Votre besoin en matière d'architecture et de fiabilité résonne avec mon parcours récent",
  ],
  creative: [
    "Le soin que vous portez à l'interface de votre produit m'invite à vous proposer ma candidature",
    "J'ai été marqué par la qualité visuelle de votre produit, et je souhaite y contribuer",
  ],
  dynamique: [
    "Votre rythme de livraison et votre exigence produit correspondent à la manière dont je travaille",
    "Je suis prêt à produire vite et bien : c'est ce que je fais depuis %YEARS% ans",
  ],
};

const pick = <T,>(arr: T[], n: number) => arr.slice(0, n);

/** Met en avant les compétences du profil qui apparaissent dans l'offre. */
export function buildCvHighlights(
  profile: Profile,
  analysis: MatchAnalysis,
  offer: JobOffer
) {
  const keywordNorm = new Set(analysis.matchedKeywords.map((k) => k.toLowerCase()));
  const relevant = professionalSkills(profile).filter(
    (s) =>
      keywordNorm.has(s.name.toLowerCase()) ||
      [...keywordNorm].some(
        (k) => k.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(k)
      ) ||
      offer.keywords.some(
        (o) => o.toLowerCase() === s.name.toLowerCase() || o.toLowerCase().includes(s.name.toLowerCase())
      )
  );

  const proofBySkill: Record<string, string> = {
    React: "240k utilisateurs/mois, LCP passé de 3,4 s à 1,1 s sur Next.js 14 + RSC",
    TypeScript: "typage strict sur 68 composants partagés par 3 squads",
    "Next.js": "migration App Router + RSC, build réduit de 38 %",
    "Node.js": "services traitant 1,2 M de transactions/jour à 99,98 % de dispo",
    Go: "ledger distribué et réconciliation temps réel en production",
    PostgreSQL: "latence P95 réduite de 41 % après partitionnement",
    Docker: "images multi-stage et environnements reproductibles",
    Kubernetes: "déploiements GitOps sur 3 clusters",
    "CI/CD": "pipeline de 6 min, du commit à la prod (tests + preview)",
    TailwindCSS: "design system de 68 composants, tokens thématisés",
    "Design system": "design system maison adopté par 3 squads (68 composants)",
    Accessibilité: "audit WCAG sur les parcours critiques, score Lighthouse a11y 96",
    Leadership: "encadrement de 4 ingénieurs + mentorat hebdomadaire",
    Mentoring: "12 mentors formés, revue d'architecture bi-mensuelle",
    Figma: "collaboration quotidienne avec le design, handoff tokenisé",
    "Product thinking": "tunnel d'onboarding refondu : +23 % de complétion",
    Performance: "LCP 1,1 s, INP sous 120 ms sur 240k sessions/mois",
    LLM: "expérimentation RAG et streaming sur produits internes",
    Anglais: "documentation technique et collègues anglophones au quotidien",
    Storybook: "catalogue de composants documenté et versionné",
    "Temps réel": "1,2 M d'événements/jour, WebSockets et back-pressure maîtrisés",
    Redis: "cache multi-niveaux, hit-rate 94 %",
    Architecture: "RFCs d'architecture et gouvernance technique",
    Remote: "3 ans en remote async, documentation-first",
  };

  /**
   * Preuve chiffrée issue du CV master : on privilégie les réalisations du
   * parcours (import de CV compris) avant la table de démonstration.
   */
  // La table de preuves ci-dessus décrit le profil de démonstration : on ne
  // l'utilise que pour lui, jamais pour un profil reconstruit depuis un CV.
  const isDemoProfile = profile.id === "usr_demo_01";

  const proofFromProfile = (skillName: string): string | undefined => {
    const needle = skillName.toLowerCase();
    const matches = profile.experience
      .flatMap((xp) => xp.highlights)
      .filter((h) => h.toLowerCase().includes(needle));
    // Une réalisation chiffrée vaut mieux qu'une mention de contexte.
    const realization = matches.find((h) => /\d/.test(h)) ?? matches[0];
    if (realization) return realization.replace(/\.$/, "");
    const diploma = profile.education.find((ed) =>
      `${ed.degree} ${ed.school}`.toLowerCase().includes(needle)
    );
    return diploma ? `${diploma.degree} — ${diploma.school}` : undefined;
  };

  const highlights =
    relevant.length > 0
      ? pick(relevant, 5).map((s) => ({
          skill: s.name,
          proof:
            (isDemoProfile ? proofBySkill[s.name] : undefined) ??
            proofFromProfile(s.name) ??
            `${s.years ?? 3}+ ans d'usage régulier · niveau ${s.level}/100`,
        }))
      : pick(
          [...professionalSkills(profile)].sort((a, b) => b.level - a.level),
          4
        ).map((s) => ({
          skill: s.name,
          proof:
            (isDemoProfile ? proofBySkill[s.name] : undefined) ??
            proofFromProfile(s.name) ??
            `${s.years ?? 3}+ ans d'usage régulier · niveau ${s.level}/100`,
        }));

  const missing = analysis.missingKeywords.slice(0, 2);
  if (missing.length) {
    highlights.push({
      skill: "Montée en compétence",
      proof: `Attendus identifiés (${missing.join(", ")}) : je les ai inscrits en priorités de mes premières semaines`,
    });
  }

  return highlights;
}

export function buildCvSummary(
  profile: Profile,
  offer: JobOffer,
  analysis: MatchAnalysis
) {
  // Aucune formulation figée (l'ancienne citait « design system » et
  // « scalabilité » même pour un CV de magasinier) : tout vient du profil.
  const strengths = professionalSkills(profile)
    .slice(0, 3)
    .map((s) => s.name)
    .join(", ");
  const focus = analysis.matchedKeywords.slice(0, 3).join(", ") || strengths || "un socle opérationnel";
  // Ancre le résumé sur une réalisation réelle du CV master plutôt que sur une
  // métrique de démonstration.
  const realization = profile.experience.flatMap((xp) => xp.highlights)[0]?.replace(/\.$/, "");
  const anchor = realization
    ? `${profile.yearsOfExperience} ans d'expérience — ${realization} —`
    : `${profile.yearsOfExperience} ans d'expérience,`;
  return `${anchor} j'apporte ${focus} sur le poste de ${offer.title.toLowerCase()} chez ${offer.company}, un périmètre qui recoupe directement ce que je pratique au quotidien.`;
}

/** Lettre de motivation percutante, adaptée au ton détecté. */
export function buildCoverLetter(
  profile: Profile,
  offer: JobOffer,
  analysis: MatchAnalysis,
  highlights: { skill: string; proof: string }[]
) {
  const [opener, bridge] = TONE_OPENERS[offer.tone].map((s) =>
    s.replace("%YEARS%", String(profile.yearsOfExperience))
  ) as [string, string];
  const keywords = analysis.matchedKeywords.slice(0, 4).join(", ");
  const gaps = analysis.missingKeywords.slice(0, 2);
  const city = offer.location === "Remote" ? "en remote" : `à ${offer.location}`;
  const fmt = (n: number) => `${n}k €`.replace(".", ",");

  const salaryLine =
    analysis.salaryFit === "sous"
      ? `Sur le plan salarial, votre fourchette ${offer.salary} se situe sous mes prétentions initiales (${fmt(
          profile.preferences.salaryMin / 1000
        )} – ${fmt(profile.preferences.salaryMax / 1000)}) : je reste ouvert à en discuter selon l'ensemble du poste et des avantages.`
      : `Sur le plan salarial, votre fourchette ${offer.salary} entre dans mes prétentions (${fmt(
          profile.preferences.salaryMin / 1000
        )} – ${fmt(profile.preferences.salaryMax / 1000)}).`;

  return `Objet : Candidature — ${offer.title} chez ${offer.company}

Madame, Monsieur,

${opener} ${offer.title} chez ${offer.company}. ${bridge}.

Mon parcours de ${profile.yearsOfExperience} ans${profile.headline ? ` (${profile.headline})` : ""} a structuré une expertise directement exploitable sur votre besoin : ${highlights
    .slice(0, 3)
    .map((h) => `${h.skill} (${h.proof})`)
    .join(" ; ")}. ${keywords ? `Votre offre mentionne ${keywords} : ce sont des terrains que je maîtrise au quotidien.` : ""}

Ce qui motive ma candidature tient en trois points : l'alignement fort entre votre offre et mon expérience (compatibilité estimée à ${analysis.score} %), le contenu du poste — ${offer.requirements[0]?.toLowerCase() ?? "un périmètre large et concret"} — et l'environnement ${offer.remote.toLowerCase()} que je recherche ${city}.${
    gaps.length
      ? ` Je mesure également les points à consolider (${gaps.join(", ")}) et je les aborderais dès les premières semaines, avec la même rigueur qui a fait ses preuves sur mes postes précédents.`
      : ""
  }

${salaryLine}

Je serais ravi d'échanger 30 minutes pour vous détailler comment j'aborderais vos trois premiers mois chez ${offer.company}. Je suis disponible pour un entretien dans les meilleurs délais.

Bien cordialement,

${profile.fullName}
${profile.email} · ${profile.phone}
${profile.location}`;

  // hint: la fonction retourne une string template — rien après ce return.
  void city;
  void fmt;
}

/** Relance J+7, personnalisée et prête à envoyer. */
export function buildFollowUpEmail(
  profile: Profile,
  offer: JobOffer,
  application: { appliedAt: string | null; matchScore: number }
) {
  const days = application.appliedAt
    ? Math.max(7, Math.round((Date.now() - new Date(application.appliedAt).getTime()) / 86_400_000))
    : 7;

  return `Objet : Rebond — ${offer.title} / ${profile.fullName} · candidature du ${new Date(
    application.appliedAt ?? Date.now()
  ).toLocaleDateString("fr-FR")}

Bonjour,

Je me permets de rebondir sur ma candidature envoyée ${days <= 7 ? "la semaine dernière" : `il y a ${days} jours`} pour le poste de ${offer.title}.

Depuis mon premier message, j'ai ${offer.tone === "technique" ? "poussé plus loin l'expérimentation sur des briques proches de votre stack (streaming, observabilité)" : "consolidé deux cas d'usage concrets qui, je crois, répondent directement à votre besoin"} : ${
    offer.keywords[0] ?? "votre périmètre technique"
  } et ${offer.keywords[1] ?? "votre enjeu produit"}.

Si le poste est toujours en cours de sélection, je reste disponible pour un échange de 20 minutes à votre convenance. Dans le cas contraire, merci pour votre retour — je suivrai avec intérêt l'évolution de vos équipes.

Bien cordialement,

${profile.fullName}
${profile.email} · ${profile.phone}`;
}

export function generateAssets(
  profile: Profile,
  offer: JobOffer,
  analysis: MatchAnalysis,
  engine: GeneratedAssets["engine"] = "rules",
  model?: string
): GeneratedAssets {
  const cvHighlights = buildCvHighlights(profile, analysis, offer);
  return {
    cvHighlights,
    cvSummary: buildCvSummary(profile, offer, analysis),
    coverLetter: buildCoverLetter(profile, offer, analysis, cvHighlights),
    emailSubject: `Candidature ${offer.title} — ${profile.fullName} (${analysis.score}% de compatibilité)`,
    followUpEmail: buildFollowUpEmail(profile, offer, {
      appliedAt: null,
      matchScore: analysis.score,
    }),
    generatedAt: new Date().toISOString(),
    engine,
    model,
  };
}
