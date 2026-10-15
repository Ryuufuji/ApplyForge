import { NextRequest, NextResponse } from "next/server";
import { analyzeOffer, analyzeText } from "@/lib/ai/matcher";
import { generateAssets } from "@/lib/ai/generator";
import { generateWithLlm, llmConfigured } from "@/lib/ai/llm";
import { offers } from "@/lib/mock/offers";
import { resolveProfile } from "@/lib/ai/profileOverride";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================================
   POST /api/generate — 1-Click Prep
   Génère : résumé + haute-saillies CV, lettre de motivation, objet d'email
   et brouillon de relance J+7, adaptés au poste et à l'entreprise.
   LLM (Anthropic/OpenAI) si clé présente, sinon moteur de règles local.
   ========================================================================== */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { offerId, text } = body as { offerId?: string; text?: string; profile?: unknown };

  // Profil master : celui reconstruit depuis le CV côté client, sinon la démo.
  const profile = resolveProfile((body as { profile?: unknown }).profile);

  const offer = offers.find((o) => o.id === offerId);
  const analysis = offer
    ? analyzeOffer(offer, profile)
    : analyzeText(text ?? "", profile, "custom");

  if (!offer && !text) {
    return NextResponse.json({ error: "offerId ou text requis" }, { status: 400 });
  }

  // Fallback : offre libre → on fabrique une offre synthétique
  const effectiveOffer =
    offer ??
    ({
      id: "custom",
      title: analysis.extraction.title ?? "Poste proposé",
      company: analysis.extraction.company ?? "l'entreprise",
      companySize: "—",
      sector: "—",
      location: profile.location.split(",")[0],
      remote: analysis.extraction.remote ?? "Hybride",
      contract: analysis.extraction.contract ?? "CDI",
      salary: analysis.extraction.salaryRange ?? "à discuter",
      salaryMin: profile.preferences.salaryMin,
      salaryMax: profile.preferences.salaryMax,
      postedAt: new Date().toISOString(),
      source: "saisie manuelle",
      url: "",
      tone: "dynamique",
      description: text ?? "",
      requirements: analysis.matchedKeywords,
      keywords: analysis.matchedKeywords,
    } as (typeof offers)[number]);

  const llm = await generateWithLlm(profile, effectiveOffer, analysis);
  const assets = llm
    ? {
        cvHighlights: llm.data.cvHighlights,
        cvSummary: llm.data.cvSummary,
        coverLetter: llm.data.coverLetter,
        emailSubject: llm.data.emailSubject,
        followUpEmail: llm.data.followUpEmail,
        generatedAt: new Date().toISOString(),
        engine: "llm" as const,
        model: llm.model,
      }
    : generateAssets(profile, effectiveOffer, analysis);

  return NextResponse.json({
    assets,
    analysis,
    offer: effectiveOffer,
    llmConfigured: llmConfigured(),
    supabaseReady: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ),
  });
}
