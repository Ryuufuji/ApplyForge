/* =============================================================================
   MISE EN PAGE D'UN PDF — reconstruit les lignes lisibles d'une page à partir
   des positions absolues des fragments de texte.

   Deux problèmes très fréquents sur les CV réellement produits (Canva, Word
   avec colonnes, modèles « deux colonnes ») cassent une extraction naïve :

   1. L'INTERLETTRAGE. Certains modèles écrivent chaque ligne lettre par
      lettre : l'item extrait vaut « n o v 2 0 2 3 - » au lieu de
      « nov 2023 - ». Sans réparation, aucune période n'est reconnue.

   2. LES COLONNES. Les items sont livrés dans l'ordre du flux PDF, pas dans
      l'ordre de lecture : la colonne latérale et la colonne principale
      s'entrelacent et les dates se retrouvent 20 lignes après leur poste.

   Ici on raisonne en géométrie : regroupement en lignes par ordonnée,
   détection d'une gouttière verticale pour séparer les colonnes, puis
   rattachement des annotations flottantes (dates alignées à droite) à la
   ligne qu'elles qualifient. Module pur : testable sans DOM ni réseau.
   ========================================================================== */

export type PdfTextItem = {
  /** Texte du fragment, déjà débarrassé de l'interlettrage. */
  text: string;
  /** Abscisse du coin gauche, origine en bas à gauche. */
  x: number;
  /** Ordonnée de la ligne de base, origine en bas à gauche. */
  y: number;
  /** Largeur du fragment en points. */
  w: number;
};

type Row = {
  y: number;
  text: string;
  items: PdfTextItem[];
};

/* ------------------------------------------------------------ interlettrage */

/** Un fragment entièrement composé de caractères isolés (« n o v 2 0 2 3 »). */
function isSpacedRun(run: string) {
  const parts = run.split(" ");
  if (parts.length < 4) return false;
  if (!parts.every((p) => p.length === 1)) return false;
  const alnum = run.replace(/[^0-9a-zA-Z\u00c0-\u024f]/g, "").length;
  return alnum / run.replace(/\s/g, "").length >= 0.7;
}

/** « n o v 2 0 2 3 - » → « nov 2023 - » ; « I n n a n g i » reste intact au
 *  niveau de la casse mais devient « Innangi ». */
export function repairLetterSpacing(text: string) {
  return text
    .replace(/(?:\S(?:\s\S){2,})/g, (run) => {
      if (!isSpacedRun(run)) return run;
      return run
        .split(" ")
        .join("")
        .replace(/([a-zà-öø-ÿ])([A-ZÀ-ÖØ-Þ])/g, "$1 $2")
        .replace(/([a-zà-öø-ÿ]+)(\d+)/gi, "$1 $2")
        .replace(/(\d+)([a-zà-öø-ÿ]+)/gi, "$1 $2")
        .replace(/(\d+)\s*([-–—])\s*([a-zà-öø-ÿ0-9]+)/gi, "$1 $2 $3")
        .replace(/^([-–—])([a-zà-öø-ÿ])/i, "$1 $2")
        .replace(/(\S)([-–—])$/, "$1 $2");
    })
    .replace(/\s+/g, " ")
    .trim();
}

/* ------------------------------------------------------------------ lignes */

function clusterRows(items: PdfTextItem[], tol = 4.5): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const buckets: { y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const last = buckets[buckets.length - 1];
    if (last && Math.abs(last.y - item.y) <= tol) last.items.push(item);
    else buckets.push({ y: item.y, items: [item] });
  }
  return buckets
    .map((bucket) => {
      const ordered = [...bucket.items].sort((a, b) => a.x - b.x);
      return {
        y: bucket.y,
        items: ordered,
        text: ordered.map((i) => i.text).filter(Boolean).join(" ").replace(/\s+/g, " ").trim(),
      };
    })
    .filter((row) => row.text)
    .sort((a, b) => b.y - a.y);
}

/* --------------------------------------------------------------- gouttière */

type Gutter = { a: number; b: number; w: number };

/** Plus large bande verticale vide qui sépare deux colonnes de texte. */
function findGutter(items: PdfTextItem[]): Gutter | null {
  if (items.length < 4) return null;
  const rows = clusterRows(items);
  const min = Math.floor(Math.min(...items.map((i) => i.x)));
  const max = Math.ceil(Math.max(...items.map((i) => i.x + i.w)));
  const width = max - min + 1;
  if (rows.length < 3 || width < 26) return null;

  const cover = new Array<number>(width).fill(0);
  const seen = new Uint8Array(width);
  for (const row of rows) {
    seen.fill(0);
    for (const item of row.items) {
      const a = Math.max(0, Math.floor(item.x) - min);
      const b = Math.min(width - 1, Math.ceil(item.x + item.w) - min);
      for (let k = a; k <= b; k++) seen[k] = 1;
    }
    for (let k = 0; k < width; k++) cover[k] += seen[k];
  }

  // Une gouttière doit rester vide sur l'essentiel de la hauteur : un paragraphe
  // pleine largeur (résumé de CV) ne doit pas l'invalider.
  const limit = Math.max(0, Math.floor(rows.length * 0.14));
  let best: Gutter | null = null;
  let start = -1;
  for (let k = 0; k <= width; k++) {
    const empty = k < width && cover[k] <= limit;
    if (empty) {
      if (start < 0) start = k;
      continue;
    }
    if (start >= 0) {
      const w = k - start;
      if (w >= 13 && start > 0 && k < width && (!best || w > best.w)) {
        best = { a: start + min, b: k - 1 + min, w };
      }
      start = -1;
    }
  }
  return best;
}

/* ------------------------------------------- annotations flottantes (dates) */

const MONTH_START = /^(?:janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)/i;

/** Un fragment court qui ressemble à une date, un mois ou une année. */
function isFloatingMeta(text: string) {
  if (!text || text.length > 26 || /[@|]/.test(text)) return false;
  if (/^(?:19|20)\d{2}$/.test(text)) return true;
  if (/(?:19|20)\d{2}/.test(text)) return true;
  if (/^\d{1,2}\s*[/.]\s*\d{2,4}$/.test(text)) return true;
  return /^[-–—]\s*(?:janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)/i.test(text);
}

const PARTIAL_PERIOD = /(?:janv|f[ée]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[ée]c)|(?:19|20)\d{2}/i;

/** Deux fragments qui poursuivent la même période (« nov 2023 - » + « dec 2023 »). */
function continuesPeriod(prev: string, next: string) {
  const p = prev.trim();
  const n = next.trim();
  if (/[-–—,:]$/.test(p)) return true;
  if (/^[-–—]/.test(n)) return true;
  return /^(?:19|20)\d{2}$/.test(n) && PARTIAL_PERIOD.test(p);
}

type MetaRun = { y: number; top: number; bottom: number; text: string };

function chainMeta(meta: PdfTextItem[], gap = 32): MetaRun[] {
  const sorted = [...meta].sort((a, b) => b.y - a.y);
  const runs: MetaRun[] = [];
  for (const item of sorted) {
    const current = runs[runs.length - 1];
    if (current && current.bottom - item.y <= gap && continuesPeriod(current.text, item.text)) {
      current.text = `${current.text} ${item.text}`.replace(/\s+/g, " ").trim();
      current.bottom = item.y;
    } else {
      runs.push({ y: item.y, top: item.y, bottom: item.y, text: item.text });
    }
  }
  return runs;
}

const HEADING_ONLY = /^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þ\s&'-]{3,}$/;

function pickTargetRow<T extends { y: number; text: string }>(rows: T[], run: MetaRun) {
  const inside = rows.filter((r) => r.y >= run.bottom - 4 && r.y <= run.top + 4);
  if (inside.length) return inside.reduce((a, b) => (b.y > a.y ? b : a));
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const row of rows) {
    if (HEADING_ONLY.test(row.text)) continue;
    const distance = Math.abs(row.y - run.bottom);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = row;
    }
  }
  return bestDistance <= 48 ? best : null;
}

/* ------------------------------------------------------- jointure de lignes */

/** Recolle les lignes coupées : « CESS | SCIENCES - » + « ÉCONOMIE », une
 *  période étalée sur deux lignes, etc. */
function joinWrappedLines(lines: string[]) {
  const out: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const prev = out[out.length - 1];
    if (prev) {
      const prevDangling = /\s[-–—]$/.test(prev);
      const prevDateish = PARTIAL_PERIOD.test(prev) && prev.length <= 42;
      const curLeading = /^[-–—]/.test(line);
      if (prevDangling && prevDateish) {
        out[out.length - 1] = `${prev.replace(/\s*[-–—]$/, "")} - ${line.replace(/^([-–—])(?=\S)/, "$1 ")}`;
        continue;
      }
      if (prevDangling && /^[A-ZÀ-ÖØ-Þ0-9]/.test(line) && line.length <= 40) {
        out[out.length - 1] = `${prev.replace(/\s*[-–—]$/, "")}-${line}`;
        continue;
      }
      if (curLeading && (prevDateish || (MONTH_START.test(line.replace(/^[-–—]\s*/, "")) && line.length <= 42))) {
        out[out.length - 1] = `${prev} ${line.replace(/^([-–—])(?=\S)/, "$1 ")}`;
        continue;
      }
      if (prevDateish && /^(?:19|20)\d{2}$/.test(line)) {
        out[out.length - 1] = `${prev} ${line}`;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

/* -------------------------------------------------------------------- zones */

function splitZones(items: PdfTextItem[]) {
  const gutter = findGutter(items);
  if (!gutter) return null;
  const left = items.filter((i) => i.x < gutter.a);
  const right = items.filter((i) => i.x >= gutter.a);
  if (!left.length || !right.length) return null;
  return [left, right];
}

const MAIN_HINT = /(exp[ée]riences?|parcours|career|profile|profil|r[ée]sum[ée]|summary|formation|education)/i;

/** La colonne « principale » : celle qui porte le contact, le résumé ou le
 *  parcours. Sans cela, l'ordre de lecture serait celui des coordonnées. */
function mainZoneIndex(zones: PdfTextItem[][]) {
  let best = 0;
  let bestScore = -Infinity;
  zones.forEach((zone, index) => {
    const text = zone.map((i) => i.text).join("\n");
    let score = text.length * 0.02;
    if (MAIN_HINT.test(text)) score += 80;
    if (/@|https?:\/\//.test(text)) score += 40;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  });
  return best;
}

function linesOfZone(items: PdfTextItem[]) {
  const rows = clusterRows(items);
  const meta: PdfTextItem[] = [];
  const content: Row[] = [];
  for (const row of rows) {
    const last = row.items[row.items.length - 1];
    const before = row.items[row.items.length - 2];
    const separated = before ? last.x - (before.x + before.w) : 0;
    if (isFloatingMeta(last.text) && (row.items.length === 1 || separated >= 40)) {
      meta.push(last);
      const rest = row.items.slice(0, -1);
      if (rest.length) {
        content.push({
          y: row.y,
          items: rest,
          text: rest.map((i) => i.text).join(" ").replace(/\s+/g, " ").trim(),
        });
      }
    } else content.push(row);
  }

  const targets = content.map((row) => ({ y: row.y, text: row.text, suffix: [] as string[] }));
  for (const run of chainMeta(meta)) {
    const target = pickTargetRow(targets, run);
    if (target) target.suffix.push(run.text);
    else targets.push({ y: run.y, text: "", suffix: [run.text] });
  }

  const lines = targets
    .sort((a, b) => b.y - a.y)
    .map((row) => `${row.text}${row.suffix.length ? (row.text ? "   " : "") + row.suffix.join(" ").trim() : ""}`.trim())
    .filter(Boolean);

  return joinWrappedLines(lines);
}

/* --------------------------------------------------------------------- API */

/**
 * Transforme les fragments d'une page en lignes lisibles : colonnes séparées,
 * interlettrage réparé, dates alignées à droite rattachées à leur ligne.
 */
export function layoutItems(items: PdfTextItem[]): string[] {
  const clean = items.filter((i) => i.text && Number.isFinite(i.x) && Number.isFinite(i.y));
  if (!clean.length) return [];

  const zones = splitZones(clean);
  if (!zones) return linesOfZone(clean);

  const mainIndex = mainZoneIndex(zones);
  const main = linesOfZone(zones[mainIndex]);
  const others = zones
    .filter((_, index) => index !== mainIndex)
    .sort((a, b) => Math.min(...a.map((i) => i.x)) - Math.min(...b.map((i) => i.x)))
    .flatMap((zone) => linesOfZone(zone));

  return [...main, "", ...others];
}
