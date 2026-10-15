"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Application, ApplicationStatus, Profile, ThemeId } from "@/lib/types";
import { initialApplications } from "@/lib/mock/applications";
import { profile as demoProfile } from "@/lib/mock/profile";

/* ============================================================================
   STORE GLOBAL — thème, pipeline de candidatures, toasts.
   Les données sont persistées en localStorage pour que la démo soit jouable ;
   dès que Supabase est branché, lib/supabase.ts reprend la main.
   ========================================================================== */

const THEMES: { id: ThemeId; label: string; hint: string }[] = [
  { id: "cyberpunk", label: "Cyberpunk", hint: "Neon dark · glassmorphism" },
  { id: "slate", label: "Minimalist Slate", hint: "Anthracite épuré" },
  { id: "synthwave", label: "Sunset Synthwave", hint: "Dégradés chauds" },
  { id: "seine", label: "Seine", hint: "Sombre sobre · focus" },
];

export type Toast = { id: number; title: string; body?: string; tone?: "ok" | "info" | "warn"; duration?: number };

type Ctx = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  themes: typeof THEMES;
  /** Profil master courant (démo, ou reconstruit depuis le CV importé). */
  profile: Profile;
  applyProfile: (next: Profile) => void;
  resetProfile: () => void;
  applications: Application[];
  addApplication: (app: Application) => void;
  setStatus: (id: string, status: ApplicationStatus, note?: string) => void;
  removeApplication: (id: string) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  ready: boolean;
};

const AppContext = createContext<Ctx | null>(null);

const KEY_THEME = "applyforge.theme";
const KEY_APPS = "applyforge.applications";
const KEY_PROFILE = "applyforge.profile";

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStorage<T>(key: string): T | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Stockage indisponible (navigation privée, quota dépassé) : on ignore.
  }
}

function isStoredApplications(value: unknown): value is Application[] {
  return Array.isArray(value);
}

function isStoredTheme(value: unknown): value is ThemeId {
  return value === "cyberpunk" || value === "slate" || value === "synthwave" || value === "seine";
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  // État initial = valeurs démo (identique serveur + client → pas de
  // mismatch d'hydratation). Le localStorage est rechargé dans l'effet
  // ci-dessous, une seule fois côté client.
  const [theme, setThemeState] = useState<ThemeId>("cyberpunk");
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [profile, setProfile] = useState<Profile>(demoProfile);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [ready, setReady] = useState(false);

  // Hydratation côté client : recharge le localStorage si présent.
  useEffect(() => {
    const storedTheme = readStorage<ThemeId>(KEY_THEME);
    const storedApps = readStorage<Application[]>(KEY_APPS);
    const storedProfile = readStorage<Profile>(KEY_PROFILE);
    if (isStoredTheme(storedTheme)) setThemeState(storedTheme);
    if (isStoredApplications(storedApps)) setApplications(storedApps);
    if (storedProfile && storedProfile.fullName) setProfile(storedProfile);
    setReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (ready) writeStorage(KEY_THEME, theme);
  }, [theme, ready]);

  useEffect(() => {
    if (ready) writeStorage(KEY_APPS, applications);
  }, [applications, ready]);

  useEffect(() => {
    if (ready) writeStorage(KEY_PROFILE, profile);
  }, [profile, ready]);

  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(demoProfile);
  }, []);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.duration ?? 4600);
  }, []);

  const addApplication = useCallback((app: Application) => {
    setApplications((prev) => [app, ...prev.filter((a) => a.id !== app.id)]);
  }, []);

  const setStatus = useCallback(
    (id: string, status: ApplicationStatus, note?: string) => {
      setApplications((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                status,
                appliedAt: a.appliedAt ?? (status !== "preparation" ? new Date().toISOString() : null),
                followUpAt:
                  status === "postule" || status === "relance"
                    ? new Date(Date.now() + 7 * 86_400_000).toISOString()
                    : status === "entretien" || status === "refus" || status === "accepte"
                      ? null
                      : a.followUpAt,
                events: [
                  ...a.events,
                  {
                    at: new Date().toISOString(),
                    status,
                    note: note ?? `Statut mis à jour → ${status}`,
                  },
                ],
              }
            : a
        )
      );
    },
    []
  );

  const removeApplication = useCallback((id: string) => {
    setApplications((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: setThemeState,
      themes: THEMES,
      profile,
      applyProfile,
      resetProfile,
      applications,
      addApplication,
      setStatus,
      removeApplication,
      toasts,
      toast,
      ready,
    }),
    [
      theme,
      profile,
      applyProfile,
      resetProfile,
      applications,
      addApplication,
      setStatus,
      removeApplication,
      toasts,
      toast,
      ready,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp doit être utilisé dans <AppProvider>");
  return ctx;
}
