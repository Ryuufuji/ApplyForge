import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { saveApplication } from "@/lib/supabase";

export const runtime = "nodejs";

/* ============================================================================
   POST /api/apply — postulation 1-click
   - valide et horodate la candidature
   - la persiste dans Supabase si branché (sinon mode démo côté client)
   - construit l'URL mailto: de secours pour l'envoi manuel
   ========================================================================== */

type ApplyPayload = {
  title: string;
  company: string;
  matchScore: number;
  channel?: "email" | "formulaire" | "quick-grabber" | "linkedin";
  to?: string;
  subject?: string;
  body?: string;
  offerUrl?: string;
};

export async function POST(req: NextRequest) {
  const payload = (await req.json().catch(() => null)) as ApplyPayload | null;

  if (!payload?.title || !payload.company) {
    return NextResponse.json({ error: "title et company requis" }, { status: 400 });
  }

  const id = randomUUID();
  const appliedAt = new Date().toISOString();
  const followUpAt = new Date(Date.now() + 7 * 86_400_000).toISOString();

  const row = {
    id,
    title: payload.title,
    company: payload.company,
    match_score: payload.matchScore,
    status: "postule",
    channel: payload.channel ?? "formulaire",
    applied_at: appliedAt,
    follow_up_at: followUpAt,
    offer_url: payload.offerUrl ?? null,
    created_at: appliedAt,
  };

  const saved = await saveApplication(row);

  const mailto = payload.to
    ? `mailto:${encodeURIComponent(payload.to)}?subject=${encodeURIComponent(
        payload.subject ?? `Candidature — ${payload.title}`
      )}&body=${encodeURIComponent(payload.body ?? "")}`
    : null;

  // Simulation du pré-remplissage de formulaire (step-by-step côté client)
  const steps = [
    "Offre récupérée et parsée",
    "Profil master chargé (CV + préférences)",
    "Champs du formulaire pré-remplis (identité, expérience, disponibilité)",
    "CV adapté + lettre jointes",
    "Candidature enregistrée dans le pipeline",
  ];

  return NextResponse.json({
    id,
    appliedAt,
    followUpAt,
    status: "postule",
    persisted: saved.ok,
    demo: !saved.ok,
    savedError: saved.ok ? undefined : (saved as { error?: string }).error,
    mailto,
    steps,
  });
}
