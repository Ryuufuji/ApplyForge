/* ============================================================================
   ENVOI D'EMAIL — provider transactionnel (Resend) sans dépendance npm.
   Sans clé, `emailProvider()` reste null : le pilote ne prétend JAMAIS avoir
   envoyé un message. Il bascule alors en remise humaine (mailto prêt).
   ========================================================================== */

export function emailProvider(): "resend" | null {
  return process.env.RESEND_API_KEY ? "resend" : null;
}

export async function sendEmail({
  to,
  subject,
  text,
}: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; provider: "resend" | null; error?: string }> {
  const provider = emailProvider();
  if (!provider) return { ok: false, provider: null };

  const from = process.env.APPLY_FROM_EMAIL;
  if (!from) {
    return { ok: false, provider, error: "APPLY_FROM_EMAIL manquant" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      return { ok: false, provider, error: `Resend HTTP ${res.status}` };
    }
    return { ok: true, provider };
  } catch (err) {
    return {
      ok: false,
      provider,
      error: err instanceof Error ? err.message : "échec Resend",
    };
  }
}

/** Construit un mailto prêt à ouvrir (remise humaine, aucun envoi simulé). */
export function buildMailto(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
