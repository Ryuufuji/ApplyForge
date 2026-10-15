/* ============================================================================
   COUCHE LLM — appel Anthropic / OpenAI si une clé est présente.
   Sinon l'application retombe automatiquement sur le moteur de règles local
   (lib/ai/*) : aucune clé requise pour faire tourner la démo.
   ========================================================================== */

const SYSTEM = `Tu es le moteur rédactionnel d'ApplyForge, outil de candidature d'emploi.
Tu écris en français professionnel, précis, sans formule creuse.
Tu reçois : le profil du candidat (JSON) et l'offre d'emploi (JSON).
Tu réponds UNIQUEMENT avec un JSON valide de la forme :
{"cvSummary": string, "cvHighlights": [{"skill": string, "proof": string}],
 "coverLetter": string, "emailSubject": string, "followUpEmail": string}`;

export function llmConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}

export type LlmPayload = {
  cvSummary: string;
  cvHighlights: { skill: string; proof: string }[];
  coverLetter: string;
  emailSubject: string;
  followUpEmail: string;
};

async function callAnthropic(userPrompt: string): Promise<{ data: LlmPayload; model: string }> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-5";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2400,
      system: SYSTEM,
      messages: [{ role: "user", content: userPrompt }],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text: string = json.content?.[0]?.text ?? "{}";
  return { data: extractJson(text), model };
}

async function callOpenAi(userPrompt: string): Promise<{ data: LlmPayload; model: string }> {
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY!}`,
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const text: string = json.choices?.[0]?.message?.content ?? "{}";
  return { data: extractJson(text), model };
}

function extractJson(text: string): LlmPayload {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Réponse LLM non JSON");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Retourne null si pas de clé ou en cas d'erreur → fallback moteur de règles. */
export async function generateWithLlm(
  profile: unknown,
  offer: unknown,
  analysis: unknown
): Promise<{ data: LlmPayload; model: string } | null> {
  if (!llmConfigured()) return null;
  const prompt = `PROFIL:\n${JSON.stringify(profile, null, 1)}\n\nOFFRE:\n${JSON.stringify(
    offer,
    null,
    1
  )}\n\nANALYSE (score ${JSON.stringify(analysis).slice(0, 1200)}):`;
  try {
    const provider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
    return provider === "openai" ? await callOpenAi(prompt) : await callAnthropic(prompt);
  } catch (err) {
    console.error("[llm] fallback rules:", err);
    return null;
  }
}
