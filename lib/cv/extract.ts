/* =============================================================================
   EXTRACTION CV — PDF, DOCX et formats texte.
   Tourne uniquement côté serveur (route /api/cv) : les paquets pdfjs-dist et
   mammoth restent externes au bundle (cf. next.config.mjs).
   ========================================================================== */

import { layoutItems, repairLetterSpacing, type PdfTextItem } from "@/lib/cv/layout";

export type CvFormat = "pdf" | "docx" | "text";

export type ExtractResult = {
  text: string;
  format: CvFormat;
  warnings: string[];
  pages?: number;
};

const TEXT_EXT = [
  ".txt", ".md", ".markdown", ".csv", ".json", ".html", ".htm",
  ".yml", ".yaml", ".rtf", ".tsv",
];

function decodeText(buf: Buffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buf);
  // Détection d'un encodage Windows-1252 : beaucoup de « � » en UTF-8.
  const broken = (utf8.match(/\uFFFD/g) ?? []).length;
  if (broken > utf8.length / 200) {
    try {
      return new TextDecoder("windows-1252").decode(buf);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

function htmlToText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Repli sans géométrie : ordre du flux PDF, coupé sur les changements d'ordonnée. */
function naiveLines(items: PdfTextItem[]): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  let lastY: number | null = null;
  const flush = () => {
    const line = current.join(" ").replace(/\s{2,}/g, " ").trim();
    if (line) lines.push(line);
    current = [];
  };
  for (const item of items) {
    if (lastY !== null && Math.abs(item.y - lastY) > 3) flush();
    if (item.text) current.push(item.text);
    lastY = item.y;
  }
  flush();
  return lines;
}

/** Fragments d'une page → lignes lisibles (colonnes, interlignage, dates). */
function pageLines(items: PdfTextItem[]) {
  const flat = items.map((item) => ({ ...item, text: repairLetterSpacing(item.text) }));
  const laid = layoutItems(flat);
  return laid.length ? laid : naiveLines(flat);
}

async function extractPdf(buf: Buffer): Promise<ExtractResult> {
  const warnings: string[] = [];
  const mod: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdfjs = mod?.default ?? mod;

  let doc: any;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buf),
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      verbosity: 0,
    }).promise;
  } catch (err) {
    // Fichier tronqué ou qui n'est pas un vrai PDF : on répond une consigne
    // exploitable plutôt qu'une erreur technique.
    return {
      text: "",
      format: "pdf",
      warnings: [
        `PDF illisible (${err instanceof Error ? err.message : "structure invalide"}). Réenregistre le CV, essaie le DOCX, ou colle le texte du CV.`,
      ],
    };
  }

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const rotate = Number(page.rotate ?? 0);
    // Les pages pivotées (90/270) ont un repère tourné : on repasse par le
    // viewport pour retrouver des coordonnées écran comparables.
    const viewport = rotate ? page.getViewport({ scale: 1 }) : null;
    const Util = pdfjs.Util;

    const items: PdfTextItem[] = [];
    for (const raw of content.items as any[]) {
      if (typeof raw?.str !== "string" || !raw.str.trim()) continue;
      let t = raw.transform;
      if (viewport && Util?.transform) t = Util.transform(viewport.transform, t);
      const x = Number(t?.[4]);
      const y = Number(t?.[5]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      items.push({ text: raw.str, x, y, w: Number(raw.width) || 0 });
    }

    pages.push(pageLines(items).join("\n"));
    page.cleanup?.();
  }

  const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) {
    warnings.push(
      "Ce PDF ne contient pas de couche texte (document scanné ou image) — colle le texte à la main."
    );
  }
  return { text, format: "pdf", warnings, pages: doc.numPages };
}

async function extractDocx(buf: Buffer): Promise<ExtractResult> {
  const warnings: string[] = [];
  const mod: any = await import("mammoth");
  const mammoth = mod?.default ?? mod;

  const result = await mammoth.extractRawText({ buffer: buf });
  const text = String(result?.value ?? "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  for (const message of (result?.messages ?? []).slice(0, 3)) {
    if (message?.message) warnings.push(String(message.message));
  }
  if (!text) warnings.push("DOCX vide ou illisible.");
  return { text, format: "docx", warnings };
}

export async function extractCvText(file: File): Promise<ExtractResult> {
  const name = (file.name ?? "").toLowerCase();
  const type = (file.type ?? "").toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  if (name.endsWith(".pdf") || type === "application/pdf") return extractPdf(buf);
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return extractDocx(buf);

  if (name.endsWith(".doc")) {
    return {
      text: "",
      format: "text",
      warnings: [
        "Le format .doc (Word 97) n'est pas lisible. Enregistre ton CV en .docx ou en .pdf, ou colle le texte.",
      ],
    };
  }

  if (TEXT_EXT.some((ext) => name.endsWith(ext)) || type.startsWith("text/")) {
    const raw = decodeText(buf);
    const text = name.endsWith(".html") || name.endsWith(".htm") ? htmlToText(raw) : raw;
    return { text: text.trim(), format: "text", warnings: [] };
  }

  // Type inconnu : on tente le PDF (magic bytes « %PDF »), sinon le texte brut.
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return extractPdf(buf);
  const text = decodeText(buf).replace(/\u0000/g, "").trim();
  return {
    text,
    format: "text",
    warnings: text ? ["Format inconnu : lecture en texte brut."] : ["Format non supporté."],
  };
}
