import { NextRequest, NextResponse } from "next/server";
import { buildProfileFromText } from "@/lib/ai/profileFromText";
import { extractCvText } from "@/lib/cv/extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/* =============================================================================
   POST /api/cv — reconstruction du profil master depuis un CV.
   - multipart/form-data : champ « file » (PDF, DOCX, TXT, MD, CSV, HTML…)
   - application/json     : { text: "<texte brut du CV>" }
   Réponse : { ok, profile, report, warnings, format }
   ========================================================================== */

const MAX_BYTES = 8 * 1024 * 1024;
const MIN_CHARS = 120;

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
      }
      if (file.size === 0) {
        return NextResponse.json({ error: "Le fichier est vide." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `Fichier trop volumineux (${Math.round(file.size / 1024)} Ko, max 8 Mo).` },
          { status: 413 }
        );
      }

      const extracted = await extractCvText(file);

      if (extracted.text.length < MIN_CHARS) {
        return NextResponse.json(
          {
            error:
              extracted.warnings[0] ??
              "Texte du CV trop court pour reconstruire un profil. Vérifie le fichier ou colle le texte.",
            format: extracted.format,
            warnings: extracted.warnings,
            textLength: extracted.text.length,
          },
          { status: 422 }
        );
      }

      const { profile, report } = buildProfileFromText(extracted.text, {
        fileName: file.name,
        sizeKo: Math.max(1, Math.round(file.size / 1024)),
      });

      return NextResponse.json({
        ok: true,
        format: extracted.format,
        pages: extracted.pages,
        chars: extracted.text.length,
        warnings: [...extracted.warnings, ...report.warnings],
        report,
        profile,
      });
    }

    const body = (await req.json().catch(() => ({}))) as { text?: string; fileName?: string };
    const text = (body.text ?? "").trim();

    if (text.length < MIN_CHARS) {
      return NextResponse.json(
        {
          error: `Texte trop court (${text.length} caractères, ${MIN_CHARS} minimum) pour reconstruire un profil.`,
        },
        { status: 400 }
      );
    }

    const { profile, report } = buildProfileFromText(text, { fileName: body.fileName });

    return NextResponse.json({
      ok: true,
      format: "text",
      chars: text.length,
      warnings: report.warnings,
      report,
      profile,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction impossible.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
