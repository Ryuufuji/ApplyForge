import { NextRequest, NextResponse } from "next/server";
import { applyQueuedItem } from "@/lib/auto/pipeline";
import { resolveProfile } from "@/lib/ai/profileOverride";
import type { QueueItem } from "@/lib/auto/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/* ============================================================================
   POST /api/auto/apply — mode supervisé : l'humain valide un item de la file.
   Le serveur regénère la lettre depuis le texte stocké, tente l'envoi réel
   (provider email) ou remet un mailto prêt, et renvoie l'item mis à jour
   ainsi que la candidature à insérer dans le pipeline.
   ========================================================================== */

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const item = (body as { item?: QueueItem } | null)?.item;
  const profile = resolveProfile((body as { profile?: unknown })?.profile);

  if (!item?.id || !item.text || !item.title || !item.company) {
    return NextResponse.json({ error: "item invalide (id, title, company, text requis)" }, { status: 400 });
  }

  try {
    const warnings: string[] = [];
    const { item: updated, application } = await applyQueuedItem(item, profile, (m) =>
      warnings.push(m)
    );
    return NextResponse.json({ item: updated, application, warnings });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "envoi impossible" },
      { status: 500 }
    );
  }
}
