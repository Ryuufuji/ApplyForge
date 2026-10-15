import type { Metadata } from "next";
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/lib/store";
import { Navbar } from "@/components/navbar";
import { QuickGrabber } from "@/components/quick-grabber";
import { Toasts } from "@/components/toasts";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const display = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ApplyForge — Postulation intelligente en 1 clic",
  description:
    "Dashboard de recherche d'emploi : analyse d'offres par IA, génération sur-mesure de CV et lettre, postulation 1-click et relances automatiques.",
};

/* Le thème est posé avant hydratation pour éviter le flash blanc. */
const themeBoot = `(function(){try{var t=JSON.parse(localStorage.getItem("applyforge.theme")||'"cyberpunk"');document.documentElement.setAttribute("data-theme",t);}catch(e){document.documentElement.setAttribute("data-theme","cyberpunk");}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      data-theme="cyberpunk"
      className={`${sans.variable} ${display.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className="font-sans antialiased">
        <AppProvider>
          <Navbar />
          <main className="relative z-10 mx-auto w-full max-w-[1440px] px-4 pb-28 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
          <QuickGrabber />
          <Toasts />
        </AppProvider>
      </body>
    </html>
  );
}
