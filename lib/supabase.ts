import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* ============================================================================
   SUPABASE — profils, historique de candidatures, stockage CV/lettres.
   Sans variables d'environnement, `hasSupabase` reste false et l'app tourne
   entièrement en mode démo (localStorage + mocks).
   ========================================================================== */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!hasSupabase) return null;
  if (!client) client = createClient(url!, anonKey!);
  return client;
}

/** Tables attendues (cf. supabase/schema.sql). */
export const TABLES = {
  profiles: "profiles",
  applications: "applications",
  offers: "offers",
  documents: "documents",
} as const;

/** Upload d'un CV/lettre dans le bucket `documents` de Supabase. */
export async function uploadDocument(file: File, userId: string) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false as const, path: null, demo: true };
  const path = `${userId}/${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from("documents").upload(path, file, {
    upsert: true,
    cacheControl: "3600",
  });
  if (error) return { ok: false as const, path: null, error: error.message };
  const { data } = supabase.storage.from("documents").getPublicUrl(path);
  return { ok: true as const, path: data.publicUrl };
}

/** Persistance d'une candidature (upsert) quand Supabase est branché. */
export async function saveApplication(row: Record<string, unknown>) {
  const supabase = getSupabase();
  if (!supabase) return { ok: false as const, demo: true };
  const { error } = await supabase.from(TABLES.applications).upsert(row, {
    onConflict: "id",
  });
  return { ok: !error, error: error?.message };
}
