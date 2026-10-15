/* ============================================================================
   APPLYFORGE — Modèle de données
   Miroir du schéma Supabase (cf. supabase/schema.sql)
   ========================================================================== */

export type ThemeId = "cyberpunk" | "slate" | "synthwave" | "seine";

export type ContractType =
  | "CDI"
  | "CDD"
  | "Freelance"
  | "Stage"
  | "Alternance"
  | "Temps partiel";

export type RemoteMode = "Sur site" | "Hybride" | "Remote";

export type ApplicationStatus =
  | "preparation" // générée, pas encore envoyée
  | "postule" // envoyée
  | "relance" // en attente de réponse / relance planifiée
  | "entretien"
  | "refus"
  | "accepte";

export interface Skill {
  name: string;
  level: number; // 0-100
  years?: number;
  category: "langage" | "framework" | "outillage" | "soft" | "data" | "design";
}

export interface Experience {
  id: string;
  role: string;
  company: string;
  period: string;
  location: string;
  highlights: string[];
}

export interface Education {
  id: string;
  degree: string;
  school: string;
  period: string;
}

export interface SearchPreferences {
  sectors: string[];
  contracts: ContractType[];
  remote: RemoteMode[];
  locations: string[];
  salaryMin: number;
  salaryMax: number;
  keywords: string[];
}

export interface Profile {
  id: string;
  fullName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  yearsOfExperience: number;
  avatarInitials: string;
  summary: string;
  skills: Skill[];
  experience: Experience[];
  education: Education[];
  preferences: SearchPreferences;
  masterCv: {
    fileName: string;
    uploadedAt: string;
    sizeKo: number;
    atsScore: number;
  };
  coverLetterBase: string;
}

export interface JobOffer {
  id: string;
  title: string;
  company: string;
  companySize: string;
  sector: string;
  location: string;
  remote: RemoteMode;
  contract: ContractType;
  salary: string;
  salaryMin: number;
  salaryMax: number;
  postedAt: string; // ISO date
  source: string;
  url: string;
  tone: "corporate" | "startup" | "technique" | "creative" | "dynamique";
  description: string;
  requirements: string[];
  keywords: string[];
}

export interface MatchAnalysis {
  offerId: string;
  score: number; // 0-100
  verdict: string;
  matchedKeywords: string[];
  missingKeywords: string[];
  toneAdvice: string;
  salaryFit: "sous" | "dans la fourchette" | "au-dessus";
  locationFit: boolean;
  strengths: string[];
  risks: string[];
  extraction: {
    title?: string;
    company?: string;
    contract?: ContractType | null;
    remote?: RemoteMode | null;
    salaryRange?: string | null;
    wordCount: number;
  };
}

export interface GeneratedAssets {
  cvHighlights: { skill: string; proof: string }[];
  cvSummary: string;
  coverLetter: string;
  emailSubject: string;
  followUpEmail: string;
  generatedAt: string;
  engine: "llm" | "rules";
  model?: string;
}

export interface ApplicationEvent {
  at: string;
  status: ApplicationStatus;
  note: string;
}

export interface Application {
  id: string;
  offerId: string;
  title: string;
  company: string;
  location: string;
  contract: ContractType;
  salary: string;
  matchScore: number;
  status: ApplicationStatus;
  appliedAt: string | null;
  followUpAt: string | null;
  channel: "email" | "formulaire" | "quick-grabber" | "linkedin";
  /** Contact détecté sur l'offre — requis pour les relances automatiques. */
  contactEmail?: string;
  events: ApplicationEvent[];
  coverLetterPreview?: string;
}

export interface ActivityPoint {
  date: string; // ISO
  sent: number;
  replies: number;
  interviews: number;
}

export interface DashboardStats {
  sent: number;
  followUpsDue: number;
  replyRate: number;
  interviews: number;
  offers: number;
  avgMatch: number;
  deltaSent: number;
  deltaReplyRate: number;
  deltaInterviews: number;
  deltaFollowUps: number;
}
