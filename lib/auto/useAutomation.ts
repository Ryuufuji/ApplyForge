"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import type { Application } from "@/lib/types";
import {
  DEFAULT_AUTO_CONFIG,
  type AutoConfig,
  type AutoLogEntry,
  type CycleReport,
  type QueueItem,
} from "./types";

/* ============================================================================
   HOOK DU PILOTE — état local persisté (localStorage), exécution des cycles,
   planificateur périodique, approbation/refus des items en mode supervisé.
   ========================================================================== */

const KEY_CONFIG = "applyforge.auto.config";
const KEY_QUEUE = "applyforge.auto.queue";
const KEY_LOGS = "applyforge.auto.logs";
const KEY_META = "applyforge.auto.meta";

const MAX_LOGS = 300;
const MAX_QUEUE = 400;

type Meta = { lastRunAt: number; sentToday: number; sentTodayDate: string };
const EMPTY_META: Meta = { lastRunAt: 0, sentToday: 0, sentTodayDate: "" };

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible : on ignore, l'état mémoire reste valide.
  }
}

export function useAutomation() {
  const { profile, applications, addApplication, setStatus, toast } = useApp();

  const [config, setConfig] = useState<AutoConfig>(DEFAULT_AUTO_CONFIG);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [logs, setLogs] = useState<AutoLogEntry[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<CycleReport | null>(null);
  const [providers, setProviders] = useState<{ email: boolean; llm: boolean; supabase: boolean } | null>(null);
  const [ready, setReady] = useState(false);

  const runningRef = useRef(false);
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // ------------------------------------------------------------- hydratation
  useEffect(() => {
    const storedConfig = read<Partial<AutoConfig>>(KEY_CONFIG, {});
    setConfig({ ...DEFAULT_AUTO_CONFIG, ...storedConfig, rules: { ...DEFAULT_AUTO_CONFIG.rules, ...(storedConfig.rules ?? {}) }, caps: { ...DEFAULT_AUTO_CONFIG.caps, ...(storedConfig.caps ?? {}) } });
    setQueue(read<QueueItem[]>(KEY_QUEUE, []));
    setLogs(read<AutoLogEntry[]>(KEY_LOGS, []));
    setMeta(read<Meta>(KEY_META, EMPTY_META));
    setReady(true);

    fetch("/api/auto/run", { method: "GET" })
      .then((r) => r.json())
      .then(setProviders)
      .catch(() => setProviders({ email: false, llm: false, supabase: false }));
  }, []);

  useEffect(() => { if (ready) write(KEY_CONFIG, config); }, [config, ready]);
  useEffect(() => { if (ready) write(KEY_QUEUE, queue.slice(0, MAX_QUEUE)); }, [queue, ready]);
  useEffect(() => { if (ready) write(KEY_LOGS, logs.slice(0, MAX_LOGS)); }, [logs, ready]);
  useEffect(() => { if (ready) write(KEY_META, meta); }, [meta, ready]);

  const pushLogs = useCallback((entries: AutoLogEntry[]) => {
    if (!entries.length) return;
    setLogs((prev) => [...entries, ...prev].slice(0, MAX_LOGS));
  }, []);

  // ------------------------------------------------------------------ cycle
  const runCycle = useCallback(async () => {
    if (runningRef.current) return null;
    runningRef.current = true;
    setRunning(true);

    const today = todayKey();
    const sentToday = metaRef.current.sentTodayDate === today ? metaRef.current.sentToday : 0;

    try {
      const res = await fetch("/api/auto/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config,
          profile,
          state: {
            queue,
            seenUrls: queue.map((q) => q.url).filter(Boolean),
            applications,
            sentToday,
            sentTodayDate: today,
          },
        }),
      });
      const next = (await res.json()) as CycleReport & { error?: string };
      if (!res.ok) throw new Error(next.error ?? "cycle impossible");

      setReport(next);
      pushLogs(next.logs);

      // Nouveaux items + remplacements (approbation).
      setQueue((prev) => {
        const byId = new Map(prev.map((q) => [q.id, q]));
        for (const item of next.created) byId.set(item.id, item);
        return [...byId.values()].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });

      // Candidatures dans le pipeline.
      for (const app of next.applications) addApplication(app);

      // Relances : avance le statut avec le détail exact dans le journal.
      for (const r of next.relances) {
        setStatus(r.applicationId, "relance", `Relance J+7 — ${r.note}`);
      }

      setMeta({
        lastRunAt: Date.now(),
        sentToday: next.capsUsedToday,
        sentTodayDate: today,
      });

      toast({
        title: `Cycle ${next.mode === "autonomous" ? "autonome" : "supervisé"} terminé`,
        body: `${next.created.length} en file · ${next.applied.length} remis/envoyés · ${next.relances.length} relance(s)`,
        tone: next.errors.length ? "warn" : "ok",
      });
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "cycle impossible";
      pushLogs([{ at: new Date().toISOString(), level: "error", scope: "cycle", message }]);
      toast({ title: "Cycle impossible", body: message, tone: "warn" });
      return null;
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }, [config, profile, queue, applications, addApplication, setStatus, toast, pushLogs]);

  // ------------------------------------------------------------ planificateur
  useEffect(() => {
    if (!ready || !config.schedulerOn) return;
    const tick = () => {
      const last = metaRef.current.lastRunAt;
      if (Date.now() - last >= config.intervalMin * 60_000) void runCycle();
    };
    const first = setTimeout(tick, 4_000);
    const id = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [ready, config.schedulerOn, config.intervalMin, runCycle]);

  // ------------------------------------------------- approbation / refus
  const approve = useCallback(
    async (itemId: string) => {
      const item = queue.find((q) => q.id === itemId);
      if (!item || runningRef.current) return;
      runningRef.current = true;
      setRunning(true);
      try {
        const res = await fetch("/api/auto/apply", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ item, profile }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "approbation impossible");

        setQueue((prev) => prev.map((q) => (q.id === itemId ? (json.item as QueueItem) : q)));
        if (json.application) addApplication(json.application as Application);
        setMeta((m) => ({ ...m, sentToday: m.sentTodayDate === todayKey() ? m.sentToday + 1 : 1, sentTodayDate: todayKey() }));
        pushLogs([{ at: new Date().toISOString(), level: "ok", scope: "envoi", message: `${item.company} — ${(json.item as QueueItem).note ?? "traité"}` }]);
        toast({ title: `${item.company} — traité`, body: (json.item as QueueItem).note, tone: "ok" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "approbation impossible";
        toast({ title: "Envoi impossible", body: message, tone: "warn" });
        pushLogs([{ at: new Date().toISOString(), level: "error", scope: "envoi", message }]);
      } finally {
        runningRef.current = false;
        setRunning(false);
      }
    },
    [queue, profile, addApplication, toast, pushLogs]
  );

  const reject = useCallback((itemId: string) => {
    setQueue((prev) =>
      prev.map((q) =>
        q.id === itemId
          ? { ...q, state: "rejected", decidedAt: new Date().toISOString(), note: "refusée par toi" }
          : q
      )
    );
  }, []);

  const derived = useMemo(() => {
    const today = todayKey();
    const sentToday = meta.sentTodayDate === today ? meta.sentToday : 0;
    const pending = queue.filter((q) => q.state === "queued");
    const handedOff = queue.filter((q) => q.state === "handed_off");
    const dueRelances = applications.filter(
      (a) => a.status === "postule" && a.followUpAt && new Date(a.followUpAt).getTime() <= Date.now()
    );
    const nextRunAt = config.schedulerOn && meta.lastRunAt
      ? meta.lastRunAt + config.intervalMin * 60_000
      : null;
    return { sentToday, pending, handedOff, dueRelances, nextRunAt };
  }, [queue, applications, meta, config.schedulerOn, config.intervalMin]);

  return {
    config,
    setConfig,
    queue,
    logs,
    meta,
    running,
    report,
    providers,
    ready,
    runCycle,
    approve,
    reject,
    clearLogs: () => setLogs([]),
    ...derived,
  };
}
