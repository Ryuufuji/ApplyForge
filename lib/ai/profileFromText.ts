import type {
  ContractType,
  Education,
  Experience,
  Profile,
  RemoteMode,
  SearchPreferences,
  Skill,
} from "@/lib/types";
import { profile as mockProfile } from "@/lib/mock/profile";
import { repairLetterSpacing } from "@/lib/cv/layout";
import {
  CEFR_LEVELS,
  CITIES,
  DEGREE_RE,
  LANGUAGE_NAMES,
  LANGUAGE_WORDS,
  ROLE_RE,
  SCHOOL_RE,
  SECTION_HEADINGS,
  SECTOR_HINTS,
  SKILLS,
} from "@/lib/ai/cvLexicon";

/* =============================================================================
   PROFIL AUTO — reconstruction complète d'un profil depuis le texte d'un CV.
   Module pur : aucun accès DOM ni réseau, donc utilisable côté serveur
   (route /api/cv) comme dans le navigateur. Aucun LLM requis : lexique métier
   (lib/ai/cvLexicon.ts) + heuristiques de mise en forme. Le LLM, s'il est
   branché, ne sert qu'à améliorer la rédaction du résumé.

   Le texte reçu est déjà remis en ordre de lecture par lib/cv/layout.ts : une
   ligne par ligne visuelle, colonnes séparées, dates rattachées à leur poste.
   Ici on interprète ce texte : identité, contact, parcours, formation,
   langues, préférences.
   ========================================================================== */

export type ProfileParseReport = {
  confidence: number;
  matchedSkills: string[];
  experiences: number;
  education: number;
  warnings: string[];
  detected: {
    name: boolean;
    email: boolean;
    phone: boolean;
    location: boolean;
    skills: boolean;
  };
};

export type ParseProfileResult = { profile: Profile; report: ProfileParseReport };

/* ------------------------------------------------------------------ helpers */

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018]/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ")
    .trim();

const SMALL_WORDS = new Set([
  "de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "pour", "avec",
  "un", "une", "sur", "chez", "dans", "ou",
]);

/** « AGENT DE SÉCURITÉ / AGENT D'ACCUEIL » → « Agent de sécurité / Agent d'accueil ». */
function smartCase(s: string) {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(/(\s+|\/)/)
    .map((part) => {
      if (!part.trim() || part === "/") return part;
      if (SMALL_WORDS.has(part)) return part;
      if (/^[dl]['’]/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join("");
}

const SUMMARY_HEADING =
  /^(profil|profile|r[ée]sum[ée]|resume|summary|objectif|accroche|à propos|a propos|en bref|pr[ée]sentation)\b/i;

/** Titres de section : la liste du lexique + ceux qui apparaissent en tête de CV. */
const EXTRA_HEADINGS = [
  SUMMARY_HEADING,
  /^(exp[ée]riences? professionn?elles?|professional experience)\b/i,
  // « PROFESSIONELLES » (un seul n) est une coquille très fréquente.
  /^(professionn?elles?|personn?elles?)\b/i,
  /^(coordonn[ée]es|contact|informations? personnelles?)\b/i,
];
const isSectionHeading = (line: string) => {
  const clean = line.trim();
  return (
    SECTION_HEADINGS.some((re) => re.test(clean)) || EXTRA_HEADINGS.some((re) => re.test(clean))
  );
};

/* --------------------------------------------------------------- table villes */

type CityMatch = { city: string; country: string };

const CITY_RULES = CITIES.map((entry) => ({ entry, key: normalize(entry.name) }))
  .filter(({ key }) => key.length >= 3)
  .map(({ entry, key }) => ({
    entry,
    re: new RegExp(`(^|[^a-z0-9])${escapeRe(key)}([^a-z0-9]|$)`, "g"),
  }));

const LANGUAGE_RULES = LANGUAGE_WORDS.map((entry) => ({
  entry,
  key: normalize(entry.alias),
}));

/* ------------------------------------------------------------------ contacts */

type Contact = { name: string; email: string; phone: string; location: string };

const NAME_WORD = /^[A-Za-zÀ-ÖØ-öø-ÿ'’.-]+$/;

function nameLikeWords(line: string) {
  const words = line.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;
  if (!words.every((w) => NAME_WORD.test(w))) return null;
  if (!words.every((w) => w === w.toUpperCase() || /^[A-ZÀ-ÖØ-Þ]/.test(w))) return null;
  return words;
}

/**
 * Le nom est la partie la plus fragile : selon le modèle il est en capitales,
 * sur une ligne ou coupé en deux (« Innangi » / « Alessandro »), et parfois
 * placé APRÈS le titre du CV. On cherche donc un candidat en minuscules/mixte
 * d'abord (bien plus fiable), puis en capitales.
 */
function extractName(lines: string[]) {
  const head = lines.slice(0, 12).map((l) => cleanLine(l));
  const isUpperLine = (line: string) =>
    line === line.toUpperCase() && /[A-ZÀ-ÖØ-Þ]{3}/.test(line);

  const candidate = (index: number): string | null => {
    const line = head[index];
    if (!line || line.length < 2 || line.length > 42) return null;
    if (/[@/\\|]|https?:|\d{2,}/.test(line)) return null;
    if (isSectionHeading(line)) return null;
    if (ROLE_RE.test(line)) return null;
    const words = nameLikeWords(line);
    if (!words) return null;
    if (words.length > 1) return line;

    // Un mot seul n'est un nom que s'il est suivi d'un autre mot isolé
    // (« Innangi » puis « Alessandro »).
    const next = head[index + 1] ?? "";
    if (!next || next.length > 20 || isSectionHeading(next) || ROLE_RE.test(next)) return null;
    const nextWords = nameLikeWords(next);
    if (!nextWords || nextWords.length !== 1) return null;
    if (isUpperLine(next) && !isUpperLine(line)) return null;
    return `${line} ${next}`;
  };

  // D'abord une graphie mixte (« Innangi Alessandro ») : un titre de CV en
  // capitales est bien plus fréquent qu'un nom en capitales.
  for (const wantedUpper of [false, true]) {
    for (let i = 0; i < head.length; i++) {
      if (!head[i] || isUpperLine(head[i]) !== wantedUpper) continue;
      const found = candidate(i);
      if (found) return isUpperLine(found) ? titleCase(found) : found;
    }
  }
  return "";
}

function extractEmail(text: string) {
  return text.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? "";
}

/** Téléphone : formats FR/BE/CH/intl, avec ou sans séparateurs. */
function extractPhone(text: string) {
  const match = text.match(
    /(?:\+\d{1,3}|00\d{1,3}|\(\s*0\s*\)|0)\s?[1-9](?:[\s.\-]?\d{2}){3,4}/
  );
  return match ? match[0].replace(/[.\-]+/g, " ").replace(/\s+/g, " ").trim() : "";
}

/** Ville + pays, déduits des villes connues, de la mention du pays et du préfixe téléphonique. */
function extractLocation(text: string, phone: string): string {
  const haystack = ` ${normalize(text)} `;
  const hits = new Map<string, { match: CityMatch; first: number; count: number }>();

  for (const { entry, re } of CITY_RULES) {
    re.lastIndex = 0;
    const found = [...haystack.matchAll(re)];
    if (!found.length) continue;
    const first = found[0].index ?? 0;
    const previous = hits.get(entry.name);
    if (previous) {
      previous.count += found.length;
      previous.first = Math.min(previous.first, first);
    } else {
      hits.set(entry.name, {
        match: { city: entry.name, country: entry.country },
        first,
        count: found.length,
      });
    }
  }

  let hint = "";
  if (/(\+\s?32|00\s?32)/.test(phone)) hint = "Belgique";
  else if (/(\+\s?33|00\s?33)/.test(phone)) hint = "France";
  else if (/belgique|belgium|\bbelge\b/i.test(text)) hint = "Belgique";
  else if (/\bfrance\b/i.test(text)) hint = "France";

  const all = [...hits.values()];
  const preferred = hint ? all.filter((h) => h.match.country === hint) : [];
  const pool = preferred.length ? preferred : all;

  if (!pool.length) {
    return /t[ée]l[ée]travail|remote|distanciel/i.test(text) ? "Remote" : "";
  }
  pool.sort((a, b) => b.count - a.count || a.first - b.first);
  return `${pool[0].match.city}, ${pool[0].match.country}`;
}

/**
 * Paragraphe de présentation du CV. On renvoie aussi la plage de lignes qu'il
 * occupe : c'est de la prose, donc jamais une expérience ni un diplôme.
 */
function extractSummaryParagraph(lines: string[]) {
  for (let i = 0; i < Math.min(lines.length, 24); i++) {
    const line = cleanLine(lines[i]);
    if (!line || !SUMMARY_HEADING.test(line)) continue;
    const collected: string[] = [];
    let last = i;
    for (let j = i + 1; j < lines.length && collected.length < 12; j++) {
      const next = cleanLine(lines[j]);
      if (!next) continue;
      if (isSectionHeading(next) || PERIOD_RE.test(next) || /@|https?:\/\//.test(next)) break;
      if (next.length <= 3) break;
      collected.push(next);
      last = j;
    }
    const text = collected.join(" ").replace(/\s+/g, " ").trim();
    if (text.length >= 80) {
      return {
        text: text.length > 460 ? `${text.slice(0, 457).trimEnd()}…` : text,
        range: [i, last] as [number, number],
      };
    }
  }
  return { text: "", range: null };
}

function extractContact(lines: string[], text: string): Contact {
  const phone = extractPhone(text);
  return {
    name: extractName(lines),
    email: extractEmail(text),
    phone,
    location: extractLocation(text, phone),
  };
}

/* ------------------------------------------------------------------ skills */

const CONTEXT_BOOST = /(expert|senior|confirmé|confirme|avancé|avance|excellente? ma[iî]trise|ma[iî]trise|solide|approfondi|polyvalen)/i;
const CONTEXT_WEAK = /(notions|débutant|debutant|bases|scolaire|initiation|en cours d'apprentissage)/i;

/** Alias → regex tolérant le pluriel (« vente » matche « ventes »). */
function aliasRegex(alias: string) {
  const plural = alias.endsWith("s") ? "" : "s?";
  return new RegExp(`(^|[^a-z0-9+#])${escapeRe(alias)}${plural}([^a-z0-9+#]|$)`, "g");
}

function extractSkills(text: string): { skills: Skill[]; matched: string[] } {
  const norm = ` ${normalize(text)} `;
  const byName = new Map<string, { alias: string; category: Skill["category"]; occ: number; index: number }>();

  for (const row of SKILLS) {
    const alias = normalize(row.alias);
    if (alias.length < 2) continue;
    const hits = [...norm.matchAll(aliasRegex(alias))];
    if (!hits.length) continue;
    const first = hits[0].index ?? 0;
    const previous = byName.get(row.name);
    if (previous) {
      previous.occ += hits.length;
      previous.index = Math.min(previous.index, first);
    } else {
      byName.set(row.name, { alias, category: row.category, occ: hits.length, index: first });
    }
  }

  const skills: Skill[] = [];
  for (const [name, { category, occ, index }] of byName) {
    const window = norm.slice(Math.max(0, index - 70), index + 90);
    let level = 56 + occ * 7;
    if (CONTEXT_BOOST.test(window)) level += 9;
    if (CONTEXT_WEAK.test(window)) level -= 12;

    const yearsMatch = window.match(/(\d{1,2})\s*ans?/);
    const years = yearsMatch ? clamp(Number(yearsMatch[1]), 1, 25) : undefined;
    if (years) level += Math.min(years, 10);

    skills.push({
      name,
      category,
      level: clamp(Math.round(level), 42, 97),
      ...(years ? { years } : {}),
    });
  }

  applyLanguageLevels(norm, skills);

  skills.sort((a, b) => b.level - a.level || a.name.localeCompare(b.name));
  const capped = skills.slice(0, 24);
  return { skills: capped, matched: capped.map((s) => s.name) };
}

/**
 * « Anglais - B2 » : les CV indiquent les langues avec un niveau CECRL. On
 * s'en sert pour fixer un niveau honnête (et créer la compétence si le
 * lexique ne l'a pas repérée).
 */
function applyLanguageLevels(norm: string, skills: Skill[]) {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const pattern = /([a-zà-öø-ÿ']{3,20})\s*[-–—:.]?\s{0,2}(a1|a2|b1|b2|c1|c2)\b/gi;

  for (const hit of norm.matchAll(pattern)) {
    const word = normalize(hit[1]);
    const level = CEFR_LEVELS[hit[2].toUpperCase()];
    if (!level) continue;
    const entry = LANGUAGE_RULES.find((l) => l.key === word);
    if (!entry) continue;

    const existing = byName.get(entry.entry.name);
    if (existing) existing.level = Math.max(existing.level, level);
    else {
      const created: Skill = { name: entry.entry.name, category: "soft", level };
      skills.push(created);
      byName.set(entry.entry.name, created);
    }
  }
}

/* ------------------------------------------------------------- expériences */

/* Mois abrégés ET complets : « avril 2025 » ne doit pas être coupé en « avr ». */
const MONTH =
  "(?:janv(?:ier)?|f[ée]vr(?:ier)?|mars|avr(?:il)?|mai|juin|juil(?:let)?|ao[uû]t|sept(?:embre)?|oct(?:obre)?|nov(?:embre)?|d[ée]c(?:embre)?)";
const PERIOD_RE = new RegExp(
  `${MONTH}?\\s*(?:19|20)\\d{2}\\s*(?:[-–—/]|\\bà\\b|\\ba\\b|\\bto\\b|jusqu'?à)\\s*${MONTH}?\\s*(?:(?:19|20)\\d{2}|aujourd[\\s'’]{0,2}hui|pr[ée]sent|\\bnow\\b|en cours|actuel)`,
  "i"
);

/* Retire uniquement les puces de liste (« - », « • », « 1. », « → »), en
   préservant les années en tête de ligne (« 2022 - Aujourd'hui »). */
const cleanLine = (l: string) =>
  l.replace(/^(\s*(?:[-–—•*·▸▪→]\s*|\d{1,2}[.)]\s+))+/, "").trim();

const trimEdges = (s: string) =>
  s.replace(/^[\s\-–—:;,|]+/, "").replace(/[\s\-–—:;,|]+$/, "").trim();

function splitSegments(line: string) {
  return line
    .split(/\s*(?:[|·•]|\s[-–—]\s|\s\/\s)\s*/)
    .map(trimEdges)
    .filter(Boolean);
}

/** Un intitulé court qui ressemble à un nom d'entreprise (pas une phrase). */
function looksLikeCompany(line: string) {
  if (!line || line.length > 48) return false;
  if (/[.!?]$/.test(line)) return false;
  if (splitSegments(line).length > 1) return false;
  return line.split(/\s+/).length <= 5;
}

function periodSpan(text: string): { min: number; max: number } | null {
  const years = [...text.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const sane = years.filter((y) => y >= 1975 && y <= new Date().getFullYear() + 1);
  if (!sane.length) return null;
  return { min: Math.min(...sane), max: Math.max(...sane) };
}

function extractExperience(lines: string[]): Experience[] {
  const out: Experience[] = [];
  const isPeriodLine = lines.map((l) => PERIOD_RE.test(l));
  const periodIdx = isPeriodLine.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);

  // Un titre ou une entreprise déjà rattaché à une expérience ne peut pas
  // l'être une seconde fois (indispensable quand le texte arrive aplati).
  const used = new Set<number>();

  const candidate = (j: number) => {
    if (j < 0 || j >= lines.length || isPeriodLine[j] || used.has(j)) return null;
    const text = cleanLine(lines[j]);
    if (!text || text.length < 3 || text.length > 80) return null;
    if (isSectionHeading(text)) return null;
    if (/@|https?:\/\//.test(text)) return null;
    return text;
  };

  for (const i of periodIdx) {
    const line = cleanLine(lines[i]);
    const period = line.match(PERIOD_RE)?.[0]?.replace(/\s+/g, " ").trim() ?? "";
    const rest = period ? line.replace(period, " ").replace(/\s{2,}/g, " ").trim() : line;

    // Une ligne de diplôme datée n'est pas une expérience.
    if (DEGREE_RE.test(rest) && !ROLE_RE.test(rest)) continue;

    const segments = splitSegments(rest).filter((s) => !isSectionHeading(s));
    const before = [i - 1, i - 2]
      .map((j) => ({ j, text: candidate(j) }))
      .filter((c): c is { j: number; text: string } => Boolean(c.text));
    const after = [i + 1, i + 2]
      .map((j) => ({ j, text: candidate(j) }))
      .filter((c): c is { j: number; text: string } => Boolean(c.text));

    // « Préparateur de commandes / Agent logistique » : deux intitulés de
    // métier sur la même ligne, c'est un poste, pas un poste + une entreprise.
    const wholeRole =
      segments.length > 1 && segments.every((s) => ROLE_RE.test(s)) && rest.length <= 80;

    let role = wholeRole ? rest : (segments.find((s) => ROLE_RE.test(s)) ?? "");
    let roleLine: number | null = null;
    if (!role) {
      const hit =
        after.find((c) => ROLE_RE.test(c.text) && c.text.length <= 60) ??
        before.find((c) => ROLE_RE.test(c.text));
      if (hit) {
        role = hit.text;
        roleLine = hit.j;
        used.add(hit.j);
      }
    }

    const isCity = (s: string) =>
      CITIES.some((c) => new RegExp(`\\b${escapeRe(c.name)}\\b`, "i").test(s));

    let company = wholeRole ? "" : (segments.find((s) => s !== role && !isCity(s)) ?? "");
    let companyLine: number | null = null;
    if (!company) {
      const pool = [...before, ...after].filter(
        (c) => c.j !== roleLine && c.text !== role && looksLikeCompany(c.text)
      );
      company = pool[0]?.text ?? "";
      companyLine = pool[0]?.j ?? null;
      if (companyLine !== null) used.add(companyLine);
    }
    if (!role && company) role = company;

    const location =
      [...segments, ...before.map((c) => c.text), ...after.map((c) => c.text)].find(isCity) ?? "";

    // Missions : lignes suivantes non vides, jusqu'à la prochaine expérience.
    const highlights: string[] = [];
    for (let j = i + 1; j < lines.length && highlights.length < 3; j++) {
      if (isPeriodLine[j]) break;
      if (j === roleLine || j === companyLine) continue;
      const raw = lines[j];
      if (isSectionHeading(raw)) break;
      const clean = cleanLine(raw);
      if (!clean || clean.length < 18) continue;
      if (/@|https?:\/\//.test(clean)) continue;
      const nextIsPeriod = [j + 1, j + 2, j + 3].some((k) => isPeriodLine[k]);
      if (ROLE_RE.test(clean) && clean.length < 60 && nextIsPeriod) break;
      highlights.push(clean.slice(0, 180));
      used.add(j);
    }

    if (!role) continue;
    if (out.some((e) => e.role === role && e.company === company)) continue;

    out.push({
      id: `xp_${out.length + 1}`,
      role: role.slice(0, 80),
      company: company.slice(0, 70),
      period: period || "—",
      location: trimEdges(location),
      highlights,
    });
  }

  return out.slice(0, 10);
}

/* --------------------------------------------------------------- formation */

function looksLikeDegree(line: string) {
  if (DEGREE_RE.test(line)) return true;
  return SCHOOL_RE.test(line) && /\b(19|20)\d{2}\b/.test(line);
}

function extractEducation(lines: string[]): Education[] {
  const out: Education[] = [];
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line || line.length < 3 || line.length > 120) continue;
    if (!looksLikeDegree(line)) continue;
    // Un intitulé de poste sans mot de diplôme n'est pas une formation.
    if (ROLE_RE.test(line) && !DEGREE_RE.test(line)) continue;

    const period =
      line.match(PERIOD_RE)?.[0]?.trim() ?? line.match(/\b(19|20)\d{2}\b/)?.[0] ?? "—";
    const withoutPeriod = line.replace(period, " ").replace(/\s+/g, " ").trim();
    let segments = splitSegments(withoutPeriod);

    // « CERTIFICAT ADEPS-COACHING » : césure en fin de ligne, on sépare.
    if (segments.length === 1 && /-/.test(segments[0]) && DEGREE_RE.test(segments[0])) {
      const [head, ...tail] = segments[0].split("-");
      segments = [trimEdges(head), trimEdges(tail.join("-"))].filter(Boolean);
    }

    const degree =
      segments.find((s) => DEGREE_RE.test(s) && !/^(?:19|20)\d{2}$/.test(s)) ?? segments[0] ?? "";
    // Le reste de la ligne décrit l'établissement ou la spécialité.
    const school = segments.filter((s) => s !== degree).join(" - ");
    if (!degree) continue;

    const key = `${degree}|${school}`;
    if (out.some((e) => `${e.degree}|${e.school}` === key)) continue;
    out.push({
      id: `edu_${out.length + 1}`,
      degree: degree.slice(0, 90),
      school: (school || "—").slice(0, 80),
      period: period.slice(0, 40),
    });
  }
  return out.slice(0, 6);
}

/* --------------------------------------------------------------- préférences */

const CONTRACT_RE: [RegExp, ContractType][] = [
  [/\bc\.?d\.?i\b|contrat à durée indéterminée|permanent contract/i, "CDI"],
  [/\bc\.?d\.?d\b|contrat à durée déterminée|fixed[- ]term/i, "CDD"],
  [/freelance|ind[ée]pendant|auto[- ]entrepreneur|portage|\btjm\b/i, "Freelance"],
  [/\bstage\b|stagiaire|internship|\bintern\b/i, "Stage"],
  [/alternance|apprentissage|apprentice/i, "Alternance"],
  [/temps partiel|mi[- ]temps|part[- ]time/i, "Temps partiel"],
];

function extractPreferences(
  text: string,
  skills: Skill[],
  contact: Contact,
  current: SearchPreferences
): SearchPreferences {
  const sectors = [...new Set(SECTOR_HINTS.filter((h) => h.re.test(text)).map((h) => h.sector))].slice(
    0,
    5
  );

  const contracts = CONTRACT_RE.filter(([re]) => re.test(text)).map(([, c]) => c);

  const remote: RemoteMode[] = [];
  if (/t[ée]l[ée]travail|remote|distanciel/i.test(text)) remote.push("Remote");
  if (/hybride|hybrid/i.test(text)) remote.push("Hybride");
  if (/sur site|pr[ée]sentiel|on[- ]site/i.test(text)) remote.push("Sur site");

  const [city, country] = contact.location.split(",").map((s) => s.trim());
  const locations = city ? [city, ...(country ? [country] : [])] : [];
  if (remote.includes("Remote")) locations.push("Remote Europe");

  const sal = text.match(/(\d{2,3})\s?k\s?[–\-à]\s?(\d{2,3})\s?k/i);
  let salaryMin = sal ? Number(sal[1]) * 1000 : current.salaryMin;
  let salaryMax = sal ? Number(sal[2]) * 1000 : current.salaryMax;
  if (salaryMin > salaryMax) [salaryMin, salaryMax] = [salaryMax, salaryMin];

  const keywords = skills
    .filter((s) => !LANGUAGE_NAMES.has(s.name))
    .slice(0, 8)
    .map((s) => s.name);

  return {
    sectors: sectors.length ? sectors : current.sectors,
    contracts: contracts.length ? contracts : current.contracts,
    remote: remote.length ? remote : current.remote,
    locations: locations.length ? locations : current.locations,
    salaryMin: clamp(salaryMin, 25_000, 250_000),
    salaryMax: clamp(salaryMax, 25_000, 300_000),
    keywords: (keywords.length ? keywords : current.keywords).slice(0, 10),
  };
}

/* ------------------------------------------------------------------ synthèse */

function extractYears(text: string, xp: Experience[], current: number) {
  const explicit = text.match(
    /(\d{1,2})\s*(?:ans?|ann[ée]es?)\s*(?:d'?exp[ée]rience|d'?experience|of experience)/i
  );
  if (explicit) return clamp(Number(explicit[1]), 0, 40);

  const spans = xp.map((e) => periodSpan(e.period)).filter((s): s is { min: number; max: number } => !!s);
  if (spans.length) {
    const min = Math.min(...spans.map((s) => s.min));
    const ongoing = /aujourd[\s'’]{0,2}hui|pr[ée]sent|en cours|actuel|\bnow\b/i.test(text);
    const max = ongoing ? new Date().getFullYear() : Math.max(...spans.map((s) => s.max));
    return clamp(max - min, 0, 40);
  }
  return current;
}

function extractHeadline(lines: string[], skills: Skill[], current: string) {
  // Titre du CV : souvent sur une à trois lignes en majuscules en tête de page.
  const caps: string[] = [];
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = cleanLine(lines[i]);
    if (!line) {
      if (caps.length) break;
      continue;
    }
    if (isSectionHeading(line) || PERIOD_RE.test(line)) {
      if (caps.length) break;
      continue;
    }
    if (/@|https?:\/\//.test(line) || /\d{4}/.test(line)) {
      if (caps.length) break;
      continue;
    }
    const isCaps = line === line.toUpperCase() && /[A-ZÀ-ÖØ-Þ]{3}/.test(line) && line.length >= 3;
    const isTitle = ROLE_RE.test(line) && line.length <= 80;
    if (isCaps || isTitle) {
      // Un mot capitalisé isolé n'ouvre pas un titre (« CONTRÔLE » après un
      // vrai titre, en revanche, le complète).
      const strong = line.split(/\s+/).length >= 2 || ROLE_RE.test(line);
      if (!caps.length && !strong) continue;
      caps.push(line);
      continue;
    }
    if (caps.length) break;
  }
  const headline = caps
    .join(" ")
    .replace(/\s*[/|]\s*$/, "")
    .replace(/\s*[-–—:]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (headline.length >= 4) return smartCase(headline);

  for (const raw of lines.slice(0, 20)) {
    const line = cleanLine(raw);
    if (!line || line.length < 6 || line.length > 95) continue;
    if (PERIOD_RE.test(line) || isSectionHeading(line)) continue;
    if (/@|https?:\/\//i.test(line)) continue;
    if (ROLE_RE.test(line)) return smartCase(line);
  }
  const top = skills.slice(0, 3).map((s) => s.name);
  return top.length ? `${top[0]} · ${top.slice(1).join(" / ")}` : current;
}

function computeAts(
  text: string,
  contact: Contact,
  xp: Experience[],
  edu: Education[],
  skills: Skill[]
) {
  let s = 44;
  if (contact.name) s += 7;
  if (contact.email) s += 5;
  if (contact.phone) s += 4;
  if (contact.location) s += 3;
  if (xp.length >= 1) s += 7;
  if (xp.length >= 2) s += 4;
  if (xp.some((e) => e.highlights.length >= 2)) s += 4;
  if (edu.length >= 1) s += 5;
  if (skills.length >= 6) s += 5;
  if (skills.length >= 12) s += 4;
  if (skills.some((sk) => LANGUAGE_NAMES.has(sk.name))) s += 3;
  if ((text.match(/^[\s]*[-–•*·▸]/gm) ?? []).length >= 4) s += 4;
  if (text.length > 1200) s += 4;
  if (text.length > 2600) s += 2;
  if (/\b(19|20)\d{2}\b/.test(text)) s += 3;
  return clamp(Math.round(s), 45, 97);
}

/* --------------------------------------------------------------------- main */

export function buildProfileFromText(
  rawText: string,
  opts: { fileName?: string; sizeKo?: number; current?: Profile } = {}
): ParseProfileResult {
  const current = opts.current ?? mockProfile;

  // Un CV copié-collé garde l'interlettrage du PDF (« n o v 2 0 2 3 ») : on le
  // répare aussi ici, faute de géométrie pour remettre les colonnes en ordre.
  const cleaned = rawText
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .split("\n")
    .map((l) => repairLetterSpacing(l))
    .join("\n")
    .trim();

  const lines = cleaned.split("\n").map((l) => l.trimEnd());
  const contact = extractContact(lines, cleaned);
  const { skills, matched } = extractSkills(cleaned);

  // Le paragraphe de présentation est de la prose : on le retire avant de
  // chercher des expériences ou des diplômes (une phrase peut contenir
  // « certificat » ou une date sans être ni l'un ni l'autre).
  const summaryBlock = extractSummaryParagraph(lines);
  const bodyLines = summaryBlock.range
    ? lines.map((l, i) =>
        i >= summaryBlock.range![0] && i <= summaryBlock.range![1] ? "" : l
      )
    : lines;

  const xp = extractExperience(bodyLines);
  const edu = extractEducation(bodyLines);
  const years = extractYears(cleaned, xp, current.yearsOfExperience);
  const headline = extractHeadline(lines, skills, current.headline);

  // Les préférences (secteurs visés) sont déduites du parcours : on écarte les
  // lignes de diplôme et les titres de section (« FORMATION » ≠ cible Éducation).
  const nonEduText = lines
    .filter((l) => {
      const c = cleanLine(l);
      return c && !looksLikeDegree(c) && !isSectionHeading(c);
    })
    .join("\n");
  const preferences = extractPreferences(nonEduText, skills, contact, current.preferences);

  // Premier import depuis la démo : les préférences que le CV ne mentionne pas
  // ne doivent pas hériter de celles du profil de démonstration (un CV de
  // magasinier n'a rien à faire avec « Freelance / Remote / 62-85k »).
  if (current.id === mockProfile.id) {
    if (preferences.contracts === current.preferences.contracts) preferences.contracts = ["CDI"];
    if (preferences.remote === current.preferences.remote) preferences.remote = ["Sur site"];
    if (
      preferences.salaryMin === current.preferences.salaryMin &&
      preferences.salaryMax === current.preferences.salaryMax
    ) {
      const floor = clamp(24_000 + years * 1_500, 24_000, 60_000);
      preferences.salaryMin = floor;
      preferences.salaryMax = floor + 10_000;
    }
  }
  const ats = computeAts(cleaned, contact, xp, edu, skills);

  const fullName = contact.name || current.fullName;
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || current.avatarInitials;

  const companies = xp.map((e) => e.company).filter((c) => c && c !== "Entreprise");
  const topSkills = skills
    .filter((s) => !LANGUAGE_NAMES.has(s.name))
    .slice(0, 3)
    .map((s) => s.name);
  const firstProof = xp.flatMap((e) => e.highlights)[0];
  const topRole = headline.split(/[·/]/)[0].trim();

  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const composed = [
    years > 0
      ? `${years} ${years > 1 ? "ans" : "an"} d'expérience${companies.length ? ` chez ${companies.slice(0, 2).join(" et ")}` : ""}`
      : "",
    topSkills.length ? `Compétences clés : ${topSkills.join(", ")}` : "",
    firstProof ? cap(firstProof.replace(/\.$/, "")) : "",
    topRole ? `Recherche un poste de ${topRole}${contact.location ? ` — ${contact.location}` : ""}.` : "",
  ]
    .filter(Boolean)
    .join(". ")
    .replace(/\.\s*\./g, ".")
    .slice(0, 430);

  // Le paragraphe de présentation du CV vaut mieux qu'un résumé recomposé.
  const summary = summaryBlock.text || composed;

  const warnings: string[] = [];
  if (!contact.name) warnings.push("Nom non détecté — reprends la valeur précédente.");
  if (!contact.email) warnings.push("Email non détecté dans le CV.");
  if (!contact.location) warnings.push("Ville non reconnue dans le CV.");
  if (!xp.length) warnings.push("Aucune expérience datée détectée.");
  if (!edu.length) warnings.push("Aucune formation détectée.");
  if (skills.length < 5) warnings.push("Peu de compétences reconnues : complète la liste à la main.");

  let confidence = 0;
  if (contact.name) confidence += 26;
  if (contact.email) confidence += 15;
  if (contact.phone) confidence += 8;
  if (contact.location) confidence += 7;
  if (skills.length >= 5) confidence += 17;
  if (skills.length >= 12) confidence += 5;
  if (xp.length >= 1) confidence += 12;
  if (edu.length >= 1) confidence += 10;

  const profile: Profile = {
    ...current,
    // Un profil reconstruit ne doit plus être confondu avec la démo : la
    // génération s'appuie sur l'identité pour choisir ses preuves chiffrées.
    id: current.id === mockProfile.id ? "usr_local_01" : current.id,
    fullName,
    headline,
    email: contact.email || current.email,
    phone: contact.phone || current.phone,
    location: contact.location || current.location,
    yearsOfExperience: years,
    avatarInitials: initials,
    summary,
    skills: skills.length ? skills : current.skills,
    experience: xp.length ? xp : current.experience,
    education: edu.length ? edu : current.education,
    preferences,
    // Base de lettre : la phrase de présentation du CV plutôt qu'un texte démo.
    coverLetterBase: summary ? summary.slice(0, 300) : current.coverLetterBase,
    masterCv: {
      fileName: opts.fileName ?? current.masterCv.fileName,
      uploadedAt: new Date().toISOString(),
      sizeKo: opts.sizeKo ?? current.masterCv.sizeKo,
      atsScore: ats,
    },
  };

  return {
    profile,
    report: {
      confidence: clamp(confidence, 0, 100),
      matchedSkills: matched,
      experiences: xp.length,
      education: edu.length,
      warnings,
      detected: {
        name: Boolean(contact.name),
        email: Boolean(contact.email),
        phone: Boolean(contact.phone),
        location: Boolean(contact.location),
        skills: skills.length > 0,
      },
    },
  };
}
