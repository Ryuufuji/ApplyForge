import type { JobOffer } from "@/lib/types";
import { offers as catalogue } from "@/lib/mock/offers";
import type { AutoSource } from "./types";

/* ============================================================================
   COLLECTEUR D'OFFRES — trois types de source :
   - "catalogue" : le catalogue local ApplyForge (toujours disponible)
   - "rss"       : flux RSS/Atom d'un job board (item → titre, lien, aperçu)
   - "list"      : page HTML de liste, extraction des liens d'offres
   Chaque candidat brut porte son URL et un aperçu ; le texte complet est
   récupéré à la volée lors du scoring (cf. lib/auto/pipeline.ts).
   ========================================================================== */

export interface RawCandidate {
  sourceId: string;
  sourceLabel: string;
  url: string;
  title: string;
  snippet: string;
  /** Présent uniquement pour le catalogue local. */
  offer?: JobOffer;
}

const ua = () =>
  process.env.SCRAPER_USER_AGENT ?? "ApplyForgeBot/1.0 (+https://applyforge.app)";

export function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#?w+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchText(url: string, timeoutMs = 12_000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": ua(), accept: "text/html,application/xhtml+xml,application/rss+xml,application/xml,*/*" },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Texte complet d'une page d'offre (pour le scoring). */
export async function fetchOfferPageText(url: string): Promise<{ ok: boolean; text: string; error?: string }> {
  try {
    const html = await fetchText(url);
    const text = stripHtml(html);
    return { ok: text.length > 80, text, error: text.length > 80 ? undefined : "page trop vide" };
  } catch (err) {
    return { ok: false, text: "", error: err instanceof Error ? err.message : "fetch impossible" };
  }
}

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();

function parseRss(xml: string, base: string, limit: number): RawCandidate[] {
  const items = xml.match(/<(item|entry)[\s\S]*?<\/\1>/gi) ?? [];
  const out: RawCandidate[] = [];

  for (const chunk of items.slice(0, limit)) {
    const titleM = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const linkM =
      chunk.match(/<link[^>]*href=["']([^"']+)["']/i) ??
      chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i) ??
      chunk.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
    const descM =
      chunk.match(/<description[^>]*>([\s\S]*?)<\/description>/i) ??
      chunk.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i) ??
      chunk.match(/<content[^>]*>([\s\S]*?)<\/content>/i);

    const title = titleM ? decode(titleM[1]) : "";
    let url = linkM ? decode(linkM[1]).trim() : "";
    if (url && !/^https?:/i.test(url)) {
      try {
        url = new URL(url, base).toString();
      } catch {
        url = "";
      }
    }
    if (!title || !url) continue;

    out.push({
      sourceId: "rss",
      sourceLabel: "RSS",
      url,
      title: title.slice(0, 140),
      snippet: descM ? decode(descM[1]).slice(0, 600) : "",
    });
  }
  return out;
}

const LINK_RE = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const SKIP_HREF = /^(#|javascript:|mailto:|tel:|\/?(css|js|img|assets|images|fonts|login|signin|signup|register|privacy|cgv|mentions|tag|category|page)\b)/i;

function parseListLinks(html: string, base: string, limit: number): RawCandidate[] {
  const out: RawCandidate[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  LINK_RE.lastIndex = 0;

  while ((m = LINK_RE.exec(html)) !== null && out.length < limit) {
    const [, hrefRaw, inner] = m;
    const text = decode(inner).trim();
    if (text.length < 10 || text.length > 160) continue;
    if (SKIP_HREF.test(hrefRaw.trim())) continue;

    let abs: string;
    try {
      abs = new URL(hrefRaw, base).toString();
    } catch {
      continue;
    }
    // Reste sur le même hôte que la page de liste (évite le menu, le footer…).
    if (hostOf(abs) !== hostOf(base)) continue;
    if (seen.has(abs)) continue;
    seen.add(abs);

    out.push({ sourceId: "list", sourceLabel: "Liste", url: abs, title: text, snippet: "" });
  }
  return out;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function collect(
  source: AutoSource,
  opts: { limit: number }
): Promise<{ candidates: RawCandidate[]; error?: string }> {
  if (source.kind === "catalogue") {
    return {
      candidates: catalogue.slice(0, opts.limit).map((offer) => ({
        sourceId: source.id,
        sourceLabel: source.label,
        url: offer.url,
        title: offer.title,
        snippet: offer.description.slice(0, 400),
        offer,
      })),
    };
  }

  if (!source.url.trim()) {
    return { candidates: [], error: "URL de source absente" };
  }

  try {
    const html = await fetchText(source.url.trim());
    if (source.kind === "rss") {
      const candidates = parseRss(html, source.url, opts.limit);
      return candidates.length
        ? { candidates }
        : { candidates: [], error: "aucun item exploitable dans ce flux" };
    }
    const candidates = parseListLinks(html, source.url, opts.limit);
    return candidates.length
      ? { candidates }
      : { candidates: [], error: "aucun lien d'offre détecté sur la page" };
  } catch (err) {
    const cause = (err as { cause?: { message?: string } })?.cause?.message;
    const msg = err instanceof Error ? err.message : "fetch impossible";
    return {
      candidates: [],
      error: cause ? `${msg} (${cause})` : msg,
    };
  }
}
