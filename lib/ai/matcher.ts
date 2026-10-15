import type { ContractType, JobOffer, MatchAnalysis, Profile, RemoteMode } from "@/lib/types";

/* ============================================================================
   AI MATCHER — moteur d'analyse d'offre
   Le score est calculé côté serveur (route /api/analyze) ; la même implémentation
   sert de fallback local si aucun LLM n'est configuré.
   ========================================================================== */

const CONTRACT_PATTERNS: [RegExp, ContractType][] = [
  [/\bc\.?d\.?i\b|contrat à durée indéterminée|permanent/i, "CDI"],
  [/\bc\.?d\.?d\b|contrat à durée déterminée/i, "CDD"],
  [/\bfreelance|t\.?n\.?s|indépendant|portage/i, "Freelance"],
  [/\bstage\b|stagiaire/i, "Stage"],
  [/\balternance|apprentissage/i, "Alternance"],
  [/\btemps partiel|mi-temps/i, "Temps partiel"],
];

const REMOTE_PATTERNS: [RegExp, RemoteMode][] = [
  [/\bremote\b|télétravail (total| intégral)|100\s?%|fully remote/i, "Remote"],
  [/\bhybride\b|\b2[–-]3\s?jours?\b/i, "Hybride"],
  [/\bsur site\b|présentiel/i, "Sur site"],
];

const SALARY_RE =
  /(\d{2,3})\s?k\s?[–\-àa]\s?(\d{2,3})\s?k\s?€?(?:\s*\/\s*an)?|(\d{2,3})\s?000\s?€?\s*[–\-àa]\s?(\d{2,3})\s?000\s?€?/i;

const STOPWORDS = new Set(
  `le la les de des du un une et ou en pour avec sur dans au aux ce cette ces qui que quoi dont par
   nous vous ils elles votre notre leur les est sont sera seront être avoir plus tres tout tous toute
   nous chercher recherchons rejoindre équipe poste rôle mission vous êtes vous avez expérience années
   ans bonne bon solides maîtrise connaissances compétences environ travail travaillez afin grâce chez
   also the and for with you we our team role job about years experience skills strong work will be
   from this that have has can able more`
    .split(/\s+/)
    .filter(Boolean)
);

/** Lexique de compétences récurrentes : alias -> nom canonique. */
const LEXICON: Record<string, string> = {
  // ---- Tech ----
  react: "React",
  "react.js": "React",
  "reactjs": "React",
  typescript: "TypeScript",
  "ts": "TypeScript",
  javascript: "JavaScript",
  "js": "JavaScript",
  nextjs: "Next.js",
  "next.js": "Next.js",
  "next js": "Next.js",
  node: "Node.js",
  "node.js": "Node.js",
  nodejs: "Node.js",
  go: "Go",
  golang: "Go",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  sql: "SQL",
  graphql: "GraphQL",
  rest: "API REST",
  "api rest": "API REST",
  docker: "Docker",
  kubernetes: "Kubernetes",
  k8s: "Kubernetes",
  aws: "AWS",
  gcp: "GCP",
  azure: "Azure",
  "ci/cd": "CI/CD",
  "cicd": "CI/CD",
  gitlab: "GitLab",
  github: "GitHub",
  tailwind: "TailwindCSS",
  tailwindcss: "TailwindCSS",
  next: "Next.js",
  vue: "Vue.js",
  angular: "Angular",
  svelte: "Svelte",
  python: "Python",
  django: "Django",
  fastapi: "FastAPI",
  redis: "Redis",
  kafka: "Kafka",
  mongo: "MongoDB",
  mongodb: "MongoDB",
  storybook: "Storybook",
  figma: "Figma",
  playwright: "Playwright",
  jest: "Jest",
  vitest: "Vitest",
  cypress: "Cypress",
  tdd: "TDD",
  agile: "Agile",
  scrum: "Scrum",
  "design system": "Design system",
  "design systems": "Design system",
  accessibilité: "Accessibilité",
  accessibility: "Accessibilité",
  wcag: "Accessibilité",
  rgaa: "Accessibilité",
  performance: "Performance",
  seo: "SEO",
  "product thinking": "Product thinking",
  "product": "Product thinking",
  leadership: "Leadership",
  management: "Leadership",
  mentorat: "Mentoring",
  mentoring: "Mentoring",
  "tech lead": "Leadership",
  architecture: "Architecture",
  "systèmes distribués": "Systèmes distribués",
  distributed: "Systèmes distribués",
  realtime: "Temps réel",
  "temps réel": "Temps réel",
  websocket: "Temps réel",
  llm: "LLM",
  rag: "LLM",
  ia: "IA",
  "ai": "IA",
  "machine learning": "Machine Learning",
  "remote": "Remote",
  anglais: "Anglais",
  english: "Anglais",

  // ---- Métiers non-tech / terrain ----

  // Logistique
  "logistique": "Logistique",
  "gestion des réceptions": "Réception",
  "réception": "Réception",
  "manifesting": "Manifesting",
  "traçabilité": "Traçabilité",
  "double comptabilité": "Double comptabilité",
  "conteneurs": "Conteneurs",
  "terminals": "Terminaux",
  "despachage": "Despachage",
  "wms": "WMS",
  "sap ewm": "SAP EWM",
  "erps": "ERP",
  "picking": "Picking",
  "packing": "Packing",
  "préparation de commande": "Préparation de commandes",
  "flux": "Flux",
  "aéroport": "Aéroport",
  "cargo": "Cargo",
  "transitaire": "Transitaire",
  "Chauffeur": "Chauffeur",
  "inventaire": "Inventaire",
  "quitus": "Quittances",
  "Stock": "Stock",
  "Bennes": "Bennes",
  "Palette": "Palette",
  "forlift": "Fôrlift",
  "agv": "AGV",
  "convoyeur": "Convoyeur",

  // Vente
  "vente": "Vente",
  "marketing": "Marketing",
  "développement commercial": "Développement commercial",
  "pharmacies": "Pharmacies",
  "parapharmacies": "Parapharmacies",
  "e-commerce": "E-commerce",
  "commerce": "Commerce",
  "argumentaire": "Argumentaire",
  "b2b": "B2B",
  "b2c": "B2C",
  "kpi": "KPI",
  "ca": "CA",
  "panier moyen": "Panier moyen",
  "taux de conversion": "Taux de conversion",
  "merchandising": "Merchandising",
  "cosmetique": "Cosmétiques",
  "cosmetics": "Cosmétiques",
  "formation continue": "Formation continue",
  "partenariat": "Partenariat",
  "partenariats": "Partenariat",
  "negociation": "Négociation",
  "prospection": "Prospection",
  "crm": "CRM",
  "hubspot": "HubSpot",
  "salesforce": "Salesforce",
  "acquisition": "Acquisition",
  "influenceur": "Influenceur",
  "fitness": "Fitness",
  "wellness": "Wellness",
  "boutique": "Boutique",
  "equipe commerciale": "Équipe commerciale",
  "directeur de magasin": "Direction de magasin",
  "responsable commercial": "Responsable commercial",

  // Sécurité
  "sécurité privée": "Sécurité privée",
  "agr": "AGR",
  "craps": "CRAPS",
  "contrôle d'accès": "Contrôle d'accès",
  "surveillance": "Surveillance",
  "vidéosurveillance": "Vidéosurveillance",
  "tour de garde": "Tour de garde",
  "site industriel": "Site industriel",
  "événementiel": "Événementiel",
  "gestion de foule": "Gestion de foule",
  "vip": "VIP",
  "forces de l'ordre": "Forces de l'ordre",
  "intervention": "Intervention",
  "garde": "Garde",
  "agencement": "Agência",
  "accueil sécurisé": "Accueil sécurisé",

  // Accueil
  "relation client": "Relation client",
  "prise de rendez-vous": "Prise de rendez-vous",
  "bureautique": "Bureautique",
  "agenda": "Agenda",
  "multilingue": "Multilingue",
  "voix": "Voix de l'entreprise",
  "syndic": "Syndic",
  "copropriété": "Copropriété",
  "congrès": "Congrès",
  "foire": "Foire",
  "signalétique": "Signalétique",
  "badges": "Badges",
  "guidage": "Guidage",
  "exposant": "Exposant",
  "conférencier": "Conférencier",
  "centre de congrès": "Centre de congrès",
  "salon": "Salon",
  "foire de bruxelles": "Foire de Bruxelles",

  // Animation
  "animation": "Animation",
  "asbl": "ASBL",
  "ateliers créatifs": "Ateliers créatifs",
  "inclusion": "Inclusion",
  "événementiel de quartier": "Événementiel de quartier",
  "workshop": "Workshop",
  "cohésion sociale": "Cohésion sociale",
  "jeunes": "Jeunes",
  "animation socioculturelle": "Animation socioculturelle",
  "animation urbaine": "Animation urbaine",
  "jeunes publics": "Jeunes publics",
  "athlétisme": "Athlétisme",
  "encadrement": "Encadrement",
  "prévention": "Prévention",
  "commune": "Commune",
  "éducation": "Éducation",
  "programmation": "Programmation",
  "street-art": "Street-art",
  "afterwork": "Afterwork",
  "intergénérationnel": "Intergénérationnel",
  "maison de quartier": "Maison de quartier",
  "parc de jeux": "Parc de jeux",
  "espace de jeunesse": "Espace de jeunesse",
  "cohésion": "Cohésion sociale",
  "atelier": "Atelier",
  "activités": "Activités",
  "publics variés": "Publics variés",

  // Langues et soft skills transverses
  "autonomie": "Autonomie",
  "relationnel": "Relationnel",
  "ponctualité": "Ponctualité",
  "fiabilité": "Fiabilité",
  "patience": "Patience",
  "sobriété": "Sobriété",
  "presentation": "Présentation",
  "grandeur": "Grandeur",
  "aisance relationnelle": "Aisance relationnelle",
  "sens du service": "Sens du service",
  "gestion du stress": "Gestion du stress",
  "rythme soutenu": "Rythme soutenu",
  "formations": "Formation",
  "pédagogie": "Pédagogie",
  "rigueur": "Rigueur",
  "organisation": "Organisation",
};

export const TONE_ADVICE: Record<JobOffer["tone"], string> = {
  corporate: "Ton formel, structuré : cadre, résultats chiffrés, vocabulaire métier.",
  startup: "Ton direct et engagé : impact, autonomie, appétence produit.",
  technique: "Ton précis : architecture, trade-offs, métriques, stack concrète.",
  creative: "Ton vivant : taste, collaboration design, soin du détail.",
  dynamique: "Ton énergique : delivery, ambition, résultats rapides.",
};

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** Détecte les mots-clés du lexique + les termes fréquents du texte. */
export function extractKeywords(text: string, limit = 14): string[] {
  const norm = ` ${normalize(text)} `;
  const found = new Set<string>();

  for (const [alias, canonical] of Object.entries(LEXICON)) {
    if (norm.includes(` ${alias} `) || norm.includes(` ${alias}.`) || norm.includes(` ${alias},`)) {
      found.add(canonical);
    }
  }

  // Termes fréquents hors stopwords (pour les mots-clés non listés)
  const freq = new Map<string, number>();
  for (const raw of normalize(text).split(" ")) {
    const w = raw.replace(/[^\wàâçéèêëîïôûùüÿœ]/g, "");
    if (w.length < 4 || STOPWORDS.has(w) || /^\d+$/.test(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const top = [...freq.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([w]) => w);

  // Déduplication insensible à la casse ("React" / "react")
  const seen = new Set<string>();
  const out: string[] = [];
  for (const kw of [...found, ...top]) {
    const key = kw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(kw);
    if (out.length >= limit) break;
  }
  return out;
}

function detectTone(text: string): JobOffer["tone"] {
  const n = normalize(text);
  const hit = (words: string[]) => words.filter((w) => n.includes(w)).length;
  const scores = {
    startup: hit(["startup", "serie a", "remote-first", "autonomie", "impact", "iteratio", "pitch", "seed"]),
    technique: hit(["architecture", "systeme", "distribue", "latence", "observabilite", "kubernetes", "rfc", "performance", "design system", "tests", "stack"]),
    corporate: hit(["process", "structure", "avantages", "rh", "grande echelle", "histoire", "implantation"]),
    creative: hit(["design", "creation", "visuel", "storytelling", "illustration", "motion"]),
    dynamique: hit(["rythme", "vite", "delivery", "croissance", "ambitieux", "direct"]),
  };
  const best = (Object.entries(scores) as [keyof typeof scores, number][]).sort(
    (a, b) => b[1] - a[1]
  )[0];
  return best && best[1] > 0 ? best[0] : "corporate";
}

/** Score de complétion du profil face au texte de l'offre. */
export function analyzeText(
  text: string,
  profile: Profile,
  offerId = "custom"
): MatchAnalysis {
  const words = text.split(/\s+/).filter(Boolean);
  const keywords = extractKeywords(text, 16);
  const lower = ` ${normalize(text)} `;

  const profileTerms = new Map<string, number>();
  profile.skills.forEach((s) => {
    profileTerms.set(normalize(s.name), s.level);
    if (s.name === "Next.js") profileTerms.set("next js", s.level);
    if (s.name === "Anglais C1") profileTerms.set("anglais", s.level);
    if (s.name === "CI/CD") profileTerms.set("cicd", s.level);
  });
  profile.preferences.keywords.forEach((k) => {
    if (!profileTerms.has(normalize(k))) profileTerms.set(normalize(k), 70);
  });
  profile.preferences.remote.forEach((r) => profileTerms.set(normalize(r), 75));

  // Index par radical (6 caractères) : tolère mentorat/mentoring, scalable/scale…
  const profileStems = new Map<string, number>();
  for (const [term, level] of profileTerms) {
    const stem = term.slice(0, 6);
    profileStems.set(stem, Math.max(profileStems.get(stem) ?? 0, level));
  }

  const covered = (kw: string) => {
    const alias = normalize(kw);
    if (profileTerms.has(alias)) return true;
    if (profileStems.has(alias.slice(0, 6))) return true;
    for (const p of profileTerms.keys()) {
      if (p.length > 3 && alias.length > 3 && (p.includes(alias) || alias.includes(p))) return true;
    }
    return false;
  };

  // On ne score que les mots-clés issus du lexique métier (les termes fréquents
  // servent au contexte, pas au calcul, pour ne pas fausser l'adéquation).
  const lexiconValues = new Set(Object.values(LEXICON));
  const candidates = keywords.filter((k) => lexiconValues.has(k));
  const scoringKeywords = candidates.length >= 3 ? candidates : keywords;

  const matched: string[] = [];
  const missing: string[] = [];
  for (const kw of scoringKeywords) {
    (covered(kw) ? matched : missing).push(kw);
  }

  const coverageRatio = scoringKeywords.length
    ? matched.length / scoringKeywords.length
    : 0.5;

  // Bonus : compétences "senior" du profil citées explicitement dans l'offre
  const strong = profile.skills.filter((s) => s.level >= 85);
  const strongHit = strong.filter((s) => {
    const n = normalize(s.name);
    return lower.includes(n) || lower.includes(n.slice(0, 6));
  }).length;
  const citedRatio = strong.length ? strongHit / strong.length : 0;

  const contract = CONTRACT_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null;

  // Score : couverture des mots-clés + bonus de crédibilité senior − malus d'écarts
  let score = 32 + 56 * coverageRatio + 8 * citedRatio - 1.5 * missing.length;
  // Malus contrat : seulement si le profil a une préférence forte (1 seul contrat accepté)
  if (contract && profile.preferences.contracts.length === 1 && !profile.preferences.contracts.includes(contract)) {
    score -= 12;
  }
  score = Math.max(12, Math.min(99, Math.round(score)));

  const remote = REMOTE_PATTERNS.find(([re]) => re.test(text))?.[1] ?? null;
  const sal = text.match(SALARY_RE);
  const salaryRange = sal
    ? `${sal[1] ?? sal[3]}k – ${sal[2] ?? sal[4]}k €`
    : null;

  const salaryFit: MatchAnalysis["salaryFit"] = !sal
    ? "dans la fourchette"
    : Number(sal[1] ?? sal[3]) * 1000 >= profile.preferences.salaryMin
      ? Number(sal[1] ?? sal[3]) * 1000 <= profile.preferences.salaryMax
        ? "dans la fourchette"
        : "au-dessus"
      : "sous";

  const locationFit = profile.preferences.locations.some(
    (l) =>
      normalize(text).includes(normalize(l)) ||
      normalize(l).includes(normalize(profile.location.split(",")[0]))
  );

  const verdict =
    score >= 85
      ? "Candidature forte — profilez et envoyez."
      : score >= 65
        ? "Bon fit — la lettre personnalisée fera la différence."
        : score >= 45
          ? "Fit partiel — mettez en avant vos transférables."
          : "Écart important — postulez seulement si motivé.";

  const strengths = [
    ...matched.slice(0, 3).map((k) => `Mot-clé maîtrisé : ${k}`),
    strongHit > 0
      ? `${strongHit} compétence${strongHit > 1 ? "s" : ""} senior du profil citée${strongHit > 1 ? "s" : ""} dans l'offre`
      : "Expérience globalement alignée",
    remote && profile.preferences.remote.includes(remote)
      ? `Mode de travail souhaité : ${remote}`
      : "Format de poste compatible",
  ];

  const risks = [
    missing.length ? `${missing.length} mot-clé(s) non couvert(s) : ${missing.slice(0, 3).join(", ")}` : "Aucun écart majeur détecté",
    salaryFit === "sous"
      ? "Fourchette salariale sous votre minimum"
      : "Fourchette salariale conforme à vos préférences",
    !locationFit && remote !== "Remote"
      ? `Localisation à vérifier (${profile.preferences.locations[0]} souhaité)`
      : "Localisation compatible",
  ];

  const toneAdvice: Record<JobOffer["tone"], string> = TONE_ADVICE;

  return {
    offerId,
    score,
    verdict,
    matchedKeywords: matched,
    missingKeywords: missing,
    toneAdvice: toneAdvice[detectTone(text)],
    salaryFit,
    locationFit,
    strengths,
    risks,
    extraction: {
      contract,
      remote,
      salaryRange,
      wordCount: words.length,
      title: guessField(text, /(titre du poste|poste\s*[:\-]|role\s*[:\-]|job title)\s*[:\-]?\s*([^\n.]{4,80})/i),
      company: guessField(text, /(entreprise|societe|compagnie|company)\s*[:\-]?\s*([^\n.]{2,50})/i),
    },
  };
}

function guessField(text: string, re: RegExp) {
  const m = text.match(re);
  return m?.[2]?.trim();
}

/** Enrichit une analyse pour une offre déjà structurée (catalogue). */
export function analyzeOffer(offer: JobOffer, profile: Profile): MatchAnalysis {
  const text = `${offer.title}\n${offer.description}\n${offer.requirements.join("\n")}\nMot-clés : ${offer.keywords.join(", ")}`;
  const analysis = analyzeText(text, profile, offer.id);
  // Bonus localisation : si le profil vise la ville de l'offre
  const offerCity = offer.location.split(",")[0];
  const cityMatch = profile.preferences.locations.some(
    (l) => normalize(l) === normalize(offerCity) || offerCity.includes(l)
  );
  const adjustedScore = cityMatch ? Math.min(99, analysis.score + 5) : analysis.score;
  return {
    ...analysis,
    score: adjustedScore,
    toneAdvice: TONE_ADVICE[offer.tone],
    extraction: {
      ...analysis.extraction,
      title: offer.title,
      company: offer.company,
      contract: offer.contract,
      remote: offer.remote,
      salaryRange: offer.salary,
    },
    salaryFit:
      offer.salaryMin < profile.preferences.salaryMin
        ? "sous"
        : offer.salaryMin > profile.preferences.salaryMax
          ? "au-dessus"
          : "dans la fourchette",
    locationFit:
      offer.remote === "Remote" ||
      profile.preferences.locations.some(
        (l) => normalize(l) === normalize(offer.location) || offer.location.includes(l)
      ) || cityMatch,
  };
}
