import type { Config } from "tailwindcss";

/**
 * ApplyForge — Configuration Tailwind
 *
 * Les 3 thèmes (cyberpunk / slate / synthwave) sont pilotés par des variables
 * CSS posées sur <html data-theme="...">. Tailwind ne référence que des
 * variables donc le switch de thème est instantané, sans re-générer les classes.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sémantique — mappé sur les variables de thème
        // ("canvas" et non "base" : "text-base" est une taille de police Tailwind)
        canvas: "rgb(var(--c-base) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        elevated: "rgb(var(--c-elevated) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        mute: "rgb(var(--c-mute) / <alpha-value>)",
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
          contrast: "rgb(var(--c-accent-contrast) / <alpha-value>)",
        },
        alt: "rgb(var(--c-alt) / <alpha-value>)",
        good: "rgb(var(--c-good) / <alpha-value>)",
        warn: "rgb(var(--c-warn) / <alpha-value>)",
        bad: "rgb(var(--c-bad) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgb(var(--c-accent) / .35), 0 0 24px -4px rgb(var(--c-accent) / .55)",
        "glow-soft":
          "0 0 0 1px rgb(var(--c-accent) / .18), 0 8px 40px -18px rgb(var(--c-accent) / .6)",
        card: "0 1px 0 0 rgb(255 255 255 / .03) inset, 0 20px 50px -30px rgb(0 0 0 / .9)",
      },
      backgroundImage: {
        "theme-gradient": "var(--bg-gradient)",
        "accent-gradient": "var(--accent-gradient)",
        grid: "var(--grid-pattern)",
      },
      keyframes: {
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        float: "float 7s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        "pulse-glow": "pulse-glow 3.2s ease-in-out infinite",
        marquee: "marquee 32s linear infinite",
      },
      transitionTimingFunction: {
        spring: "cubic-bezier(.16,1,.3,1)",
      },
    },
  },
  plugins: [],
};

export default config;
