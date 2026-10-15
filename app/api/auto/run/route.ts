import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/auto/pipeline";
import { emailProvider } from "@/lib/auto/mailer";
import { llmConfigured } from "@/lib/ai/llm";
import { resolveProfile } from "@/lib/ai/profileOverride";
import { hasSupabase } from "@/lib/supabase";
import { DEFAULT_AUTO_CONFIG, type AutoConfig, type CycleRequestState } from "@/lib/auto/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/* ============================================================================
   POST /api/auto/run — exécute UN cycle du pilote automatique :
   collecte → scoring → règles strictes → file d'attente / envoi sous caps →
   relances J+7 dues. GET renvoie l'état des providers (email/LLM/Supabase).
   ========================================================================== */

/** Fusion défensive : toute config partielle retombe sur les défauts sûrs. */
function sanitizeConfig(raw: unknown): AutoConfig {
  const cfg = (raw ?? {}) as Partial<AutoConfig>;
  const rules = (cfg.rules ?? {}) as Partial<AutoConfig["rules"]>;
  const caps = (cfg.caps ?? {}) as Partial<AutoConfig["caps"]>;
  const clamp = (v: unknown, min: number, max: number, fallback: number) => {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : fallback;
    return Math.min(max, Math.max(min, n));
  };
  return {
    ...DEFAULT_AUTO_CONFIG,
    ...cfg,
    mode: cfg.mode === "autonomous" ? "autonomous" : "supervise",
    intervalMin: clamp(cfg.intervalMin, 1, 1440, DEFAULT_AUTO_CONFIG.intervalMin),
    sources: Array.isArray(cfg.sources) && cfg.sources.length
      ? cfg.sources.filter((s) => s && typeof s.url === "string" || s?.kind === "catalogue")
      : DEFAULT_AUTO_CONFIG.sources,
    rules: {
      minScore: clamp(rules.minScore, 0, 100, DEFAULT_AUTO_CONFIG.rules.minScore),
      sectors: Array.isArray(rules.sectors) ? rules.sectors.filter((s) => typeof s === "string") : [],
      contracts: Array.isArray(rules.contracts) ? rules.contracts : [],
      locations: Array.isArray(rules.locations) ? rules.locations.filter((s) => typeof s === "string") : [],
      remote: Array.isArray(rules.remote) ? rules.remote : [],
      salaryMin: clamp(rules.salaryMin, 0, 500_000, 0),
      blacklist: Array.isArray(rules.blacklist) ? rules.blacklist.filter((s) => typeof s === "string") : [],
    },
    caps: {
      perCycle: clamp(caps.perCycle, 1, 50, DEFAULT_AUTO_CONFIG.caps.perCycle),
      perDay: clamp(caps.perDay, 1, 100, DEFAULT_AUTO_CONFIG.caps.perDay),
      perHostCooldownDays: clamp(caps.perHostCooldownDays, 0, 365, DEFAULT_AUTO_CONFIG.caps.perHostCooldownDays),
      delayBetweenMs: clamp(caps.delayBetweenMs, 0, 10_000, DEFAULT_AUTO_CONFIG.caps.delayBetweenMs),
      relancesPerCycle: clamp(caps.relancesPerCycle, 0, 30, DEFAULT_AUTO_CONFIG.caps.relancesPerCycle),
    },
  };
}

function sanitizeState(raw: unknown): CycleRequestState {
  const s = (raw ?? {}) as Partial<CycleRequestState>;
  return {
    queue: Array.isArray(s.queue) ? s.queue : [],
    seenUrls: Array.isArray(s.seenUrls) ? s.seenUrls.filter((u) => typeof u === "string") : [],
    applications: Array.isArray(s.applications) ? s.applications : [],
    sentToday: typeof s.sentToday === "number" ? Math.max(0, s.sentToday) : 0,
    sentTodayDate: typeof s.sentTodayDate === "string" ? s.sentTodayDate : "",
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const config = sanitizeConfig((body as { config?: unknown }).config);
  const state = sanitizeState((body as { state?: unknown }).state);
  const profile = resolveProfile((body as { profile?: unknown }).profile);

  try {
    const report = await runCycle({ config, profile, state });
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "cycle impossible" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    email: Boolean(emailProvider()),
    llm: llmConfigured(),
    supabase: hasSupabase,
  });
}
