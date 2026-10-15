# ⚡ ApplyForge

Application web de **recherche d'emploi** et de **postulation automatisée en 1 clic** :
analyse d'offres par IA, génération sur-mesure de CV et de lettre, envoi automatisé,
suivi de pipeline et relances automatiques à J+7.

---

## Stack

| Couche | Choix |
| --- | --- |
| Frontend | **Next.js 14 (App Router)** · React 18 · TypeScript |
| Styling | **Tailwind CSS** (tokens sémantiques) · **Framer Motion** |
| Base de données & Auth | **Supabase** (profils, candidatures, Storage CV/lettres) — *optionnel, mode démo sinon* |
| IA / LLM | **Anthropic Claude** ou **OpenAI** — *optionnel, moteur de règles local sinon* |
| Offres | Scraping serveur (`/api/analyze`) + catalogue de démo |
| Import CV | `pdfjs-dist` (PDF) + `mammoth` (DOCX), extraction serveur dans `/api/cv` |
| Graphiques | SVG 100 % maison, animés (pas de dépendance charting) |

## Démarrage

```bash
npm install
npm run dev        # http://localhost:3000
```

Copier `.env.example` → `.env.local` **uniquement si tu branches les services** :
l'application fonctionne intégralement sans clé (mode démo).

```bash
npm run typecheck  # vérification TypeScript
npm run build      # build de production
```

## Architecture

```
app/
├── layout.tsx               # fonts, providers, navbar, boot du thème
├── page.tsx                 # Dashboard : stats, graphiques, relances, historique
├── offres/page.tsx          # AI Matcher : catalogue noté + analyse URL/texte
├── candidatures/page.tsx    # Pipeline kanban + journal horodaté
├── relances/page.tsx        # Relances automatiques J+7
├── profil/page.tsx          # Profil master : CV, parcours, préférences
├── automatisation/page.tsx  # Pilote : mode supervisé + autonome, règles, journal
├── cv/layout.ts             # PDF → lignes lisibles (colonnes, interlignage)
├── cv/extract.ts            # extraction PDF / DOCX / texte (serveur)
└── api/
    ├── analyze/route.ts     # scraping + extraction + scoring d'adéquation
    ├── generate/route.ts    # 1-Click Prep (LLM ou règles)
    ├── apply/route.ts       # postulation 1-click + persistance
    └── auto/
        ├── run/route.ts     # un cycle du pilote (GET = état des providers)
        └── apply/route.ts   # approbation humaine d'un item de la file
components/
├── navbar.tsx · theme-switcher.tsx · toasts.tsx
├── quick-grabber.tsx        # gadget ⌘K (URL/texte → candidature)
├── offers-workspace.tsx     # analyse / prep / envoi
├── ui.tsx                   # Card, ScoreRing, Counter, Badge, Bar…
└── charts.tsx               # ActivityChart, DonutChart, BarList, Sparkline
lib/
├── types.ts                 # modèle de données (miroir du SQL)
├── store.tsx                # contexte global : thème, pipeline, toasts
├── analytics.ts             # stats, statuts, formatage temporel
├── ai/matcher.ts            # mots-clés, ton, contrat, score %
├── ai/generator.ts          # CV adapté, lettre, relance J+7
├── ai/llm.ts                # Anthropic / OpenAI avec fallback
├── auto/                    # pilote automatique
│   ├── types.ts             # config, file, plafonds, rapports de cycle
│   ├── collector.ts         # collecte : catalogue, flux RSS, pages de liste
│   ├── rules.ts             # filtre strict avec motifs de refus explicites
│   ├── pipeline.ts          # cycle : collecte → scoring → règles → envoi → relances
│   ├── mailer.ts            # provider Resend + mailto de secours (jamais simulé)
│   └── useAutomation.ts     # état client persistant + planificateur
├── supabase.ts              # client + storage + upsert
└── mock/                    # profil, 12 offres, candidatures, activité
supabase/schema.sql          # tables, index, RLS, bucket, cron
tailwind.config.ts           # tokens sémantiques liés aux variables de thème
app/globals.css              # les 3 thèmes + utilitaires (glass, btn, chip…)
```

## Les 3 thèmes

Permutables depuis la navbar (`<html data-theme="…">`, persisté en localStorage) :

1. **Cyberpunk / Neon Dark** — fond quasi noir, néons violets/cyan, glow + glassmorphism + scanlines.
2. **Minimalist Slate** — anthracite épuré, filets fins, zéro néon, typographie soignée.
3. **Sunset Synthwave** — dégradés chauds rose/orange/violet, ambiance rétro-futuriste.

Tailwind ne référence que des variables (`rgb(var(--c-accent) / …)`), le switch est donc
instantané : aucune classe n'est régénérée.

## Fonctionnalités

- **Profil & Base Master** — CV de base (upload Supabase Storage), parcours, compétences, préférences (secteur, salaire, contrat, localisation).
- **Import de CV → profil automatique** — dépose un **PDF**, un **DOCX** ou colle le texte : le serveur extrait le contenu (`pdfjs-dist` / `mammoth`, route `/api/cv`) puis reconstruit tout le profil (identité, contact, résumé, compétences notées, expériences, formation, préférences). L'extraction PDF raisonne en géométrie (`lib/cv/layout.ts`) : les **colonnes** sont séparées, l'**interlettrage** (`n o v 2 0 2 3` → `nov 2023`) est réparé et les **dates alignées à droite** sont rattachées à leur poste. Un aperçu détaille le parcours lu, les formations et les compétences avec le score de confiance et les avertissements avant application ; le profil alimente ensuite le matcher, le 1-Click Prep et le dashboard.
- **AI Matcher** — analyse d'une URL ou d'un texte collé : mots-clés extraits, ton de l'entreprise, contrat, fourchette salariale, **score d'adéquation %**, forces et risques.
- **1-Click Prep** — résumé + haute-saillies du CV, lettre personnalisée au ton détecté, objet d'email et **brouillon de relance J+7**.
- **Postulation 1-clic** — pipeline d'envoi pas-à-pas (pré-remplissage → jointions → soumission), enregistrement immédiat du statut.
- **Relances automatiques** — brouillon généré 7 jours après l'envoi, envoyé/reporté en un clic.
- **Quick Grabber (⌘K)** — champ d'injection rapide : lien ou copier-coller → analyse → candidature.
- **Dashboard** — envoyées, relances dues, taux de retour, entretiens, courbe d'activité, pipeline, entonnoir, top secteurs.

## Pilote automatique (`/automatisation`)

Deux modes cohabitent, commutable depuis la page **Auto** :

1. **Supervisé** — le pilote collecte les offres (catalogue, flux RSS, pages de
   liste), les note avec le profil master, applique les règles strictes et remplit
   une file d'attente. Tu approuves ou refuses chaque candidature ; l'approbation
   régénère la lettre et tente l'envoi réel.
2. **Autonome** — mêmes étapes, mais l'envoi part tout seul sous plafonds, et les
   relances J+7 des candidatures sans réponse sont préparées/envoyées à chaque cycle.

Garde-fous systématiques :

- règles : score minimal, secteurs, contrats, villes, modes de travail, salaire
  plancher, liste noire — chaque refus est motivé dans le journal ;
- plafonds : envois par cycle, par jour, cooldown par site, délai entre envois,
  relances par cycle ;
- anti-doublons : URLs vues, entreprises déjà postulées dans le pipeline ;
- **aucun envoi simulé** : sans `RESEND_API_KEY`, le pilote remet un `mailto:` prêt
  (état « remise ») et le dit dans le journal. Avec la clé, il envoie via Resend.
- planification optionnelle (cycle périodique tant que l'app est ouverte),
  état persisté en localStorage, journal horodaté complet.

Sources RSS/listes : ajoute l'URL du flux ou de la page de liste dans la carte
« sources de collecte ». Respecte les conditions d'utilisation des sites ciblés.

## Application Linux (Electron)

Le projet se emballe en application de bureau autonome : le serveur Next de
production tourne **dans** le processus principal Electron (port libre en
127.0.0.1), la fenêtre charge cette URL, contexte isolé et sandbox activés.

```bash
npm run build           # build de production (requis)
npm run pack:linux      # → dist/ApplyForge-linux-x64/          (dossier, 664 Mo)
npm run pack:appimage   # → dist/ApplyForge-x86_64.AppImage     (184 Mo)
npm run pack:deb        # → dist/applyforge_1.0.0_amd64.deb     (153 Mo)
```

- **AppImage** : un fichier autonome, `chmod +x` puis double-clic — rien à
  installer (aucun root requis).
- **.deb** : `sudo dpkg -i dist/applyforge_1.0.0_amd64.deb` sur Debian/Ubuntu
  (dépendances GTK/NSS déclarées avec alternatives t64).
- **Dossier** : binaire direct dans `dist/ApplyForge-linux-x64/`.
- Un raccourci de menu **ApplyForge** est installé dans
  `~/.local/share/applications/applyforge.desktop` (icône incluse).
- `npm run electron` — lance l'app depuis la racine (utilise `.next`).
- `npm run electron:dev` — charge un `npm run dev` déjà lancé sur :3000.
- Les liens externes s'ouvrent dans le navigateur par défaut ; un seul
  instance à la fois (verrou unique) ; zip Electron pris dans le cache local.

## Passer en production

1. `supabase/schema.sql` dans le SQL Editor + bucket `documents` + Auth activé.
2. Renseigner `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Renseigner `ANTHROPIC_API_KEY` (ou `OPENAI_API_KEY`) pour les lettres générées par LLM.
4. Brancher un provider d'envoi (Resend/SMTP) dans `app/api/apply` et un scheduler de relances (Vercel Cron ou `pg_cron`).
