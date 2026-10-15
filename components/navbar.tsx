"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Zap, Command, LayoutDashboard, Briefcase, Bot, KanbanSquare, Send, User } from "lucide-react";
import clsx from "clsx";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { useApp } from "@/lib/store";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/offres", label: "Offres", icon: Briefcase },
  { href: "/automatisation", label: "Auto", icon: Bot },
  { href: "/candidatures", label: "Candidatures", icon: KanbanSquare },
  { href: "/relances", label: "Relances", icon: Send },
  { href: "/profil", label: "Profil", icon: User },
];

export function Navbar() {
  const pathname = usePathname();
  const { applications, toast } = useApp();
  const pending = applications.filter((a) => a.status === "relance").length;

  return (
    <header className="sticky top-0 z-50 border-b border-line/50 bg-canvas/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="group flex items-center gap-2.5">
          <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-accent-gradient shadow-glow-soft">
            <Zap size={17} className="text-accent-contrast" strokeWidth={2.6} />
          </span>
          <span className="hidden font-display text-lg font-bold tracking-tight sm:block">
            Apply<span className="text-gradient">Forge</span>
          </span>
        </Link>

        {/* Navigation centrale */}
        <nav className="ml-2 hidden items-center gap-1 lg:flex">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={clsx(
                  "relative flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors",
                  active ? "text-ink" : "text-mute hover:text-ink"
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-elevated/80 ring-1 ring-accent/40"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
                <Icon size={15} />
                {label}
                {href === "/relances" && pending > 0 && (
                  <span className="ml-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn/20 px-1 font-mono text-[10px] font-bold text-warn">
                    {pending}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-1.5 rounded-lg border border-line/60 px-2.5 py-1.5 font-mono text-[11px] text-mute 2xl:flex">
            <Command size={11} /> K · Quick Grabber
          </div>

          <button
            type="button"
            onClick={() => toast({ title: "Mode démo", body: "Connecte Supabase pour synchroniser ton profil.", tone: "info" })}
            className="hidden items-center gap-2 rounded-lg border border-line/60 px-2.5 py-1.5 text-xs text-mute transition hover:border-accent/60 hover:text-ink xl:flex"
          >
            <span className="h-2 w-2 rounded-full bg-good shadow-[0_0_8px] shadow-good" />
            Sync active
          </button>

          <ThemeSwitcher />

          <Link href="/offres" className="btn btn-primary hidden sm:inline-flex">
            <Zap size={15} /> Postuler
          </Link>
        </div>
      </div>

      {/* Navigation mobile */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line/40 px-3 py-1.5 lg:hidden">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs",
                active ? "bg-elevated text-ink ring-1 ring-accent/40" : "text-mute"
              )}
            >
              <Icon size={13} /> {label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
