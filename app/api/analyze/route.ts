import { NextRequest, NextResponse } from "next/server";
import { analyzeOffer, analyzeText } from "@/lib/ai/matcher";
import { offers } from "@/lib/mock/offers";
import { resolveProfile } from "@/lib/ai/profileOverride";
import { hasSupabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 30;

/* ============================================================================
   POST /api/analyze — analyse d'une offre (URL, texte collé ou id du catalogue)
   1. récupération du texte (fetch + nettoyage HTML si URL)
   2. extraction des mots-clés / ton / contrat / salaire
   3. score d'adéquation avec le profil master
   ========================================================================== */

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function fetchOfferText(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          process.env.SCRAPER_USER_AGENT ?? "ApplyForgeBot/1.0 (+https://applyforge.app)",
        accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    const text = stripHtml(html);
    return { text, ok: true as const };
  } catch (err) {
    return { text: "", ok: false as const, error: err instanceof Error ? err.message : "fetch failed" };
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { url, text, offerId } = body as {
    url?: string;
    text?: string;
    offerId?: string;
    profile?: unknown;
  };

  // Profil master : celui reconstruit depuis le CV côté client, sinon la démo.
  const profile = resolveProfile((body as { profile?: unknown }).profile);

  // 1. Offre du catalogue déjà structurée
  if (offerId) {
    const offer = offers.find((o) => o.id === offerId);
    if (offer) {
      return NextResponse.json({
        source: "catalogue",
        offer,
        analysis: analyzeOffer(offer, profile),
        engine: "rules",
        supabase: hasSupabase,
      });
    }
  }

  let content = (text ?? "").trim();
  let source: "paste" | "url" | "empty" = content ? "paste" : "empty";
  let fetchError: string | undefined;

  // 2. Scraping d'une URL d'offre
  if (!content && url) {
    const fetched = await fetchOfferText(url.trim());
    if (fetched.ok && fetched.text.length > 120) {
      content = fetched.text.slice(0, 12_000);
      source = "url";
    } else {
      fetchError = fetched.ok
        ? "Page trop vide pour être analysée"
        : `Impossible de récupérer la page (${fetched.error})`;
    }
  }

  if (!content) {
    return NextResponse.json(
      { error: fetchError ?? "Aucun texte d'offre fourni", source },
      { status: 400 }
    );
  }

  const analysis = analyzeText(content, profile);

  return NextResponse.json({
    source,
    analysis,
    fetchError,
    engine: "rules",
    supabase: hasSupabase,
    preview: content.slice(0, 400),
  });
}
