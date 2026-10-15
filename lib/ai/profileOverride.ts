import type { Profile } from "@/lib/types";
import { profile as mockProfile } from "@/lib/mock/profile";

/* =============================================================================
   RÉSOLUTION DU PROFIL CÔTÉ SERVEUR
   Le client envoie le profil qu'il utilise (éventuellement reconstruit depuis
   le CV master) dans le corps de la requête. On le fusionne avec le profil de
   démonstration pour qu'aucun champ manquant ne casse l'analyse ou la
   génération. Sans profil transmis, on retombe sur la démo.
   ========================================================================== */

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function resolveProfile(input?: unknown): Profile {
  if (!isObject(input)) return mockProfile;

  const partial = input as Partial<Profile>;
  const skills = Array.isArray(partial.skills) && partial.skills.length
    ? partial.skills
    : mockProfile.skills;
  const experience = Array.isArray(partial.experience) && partial.experience.length
    ? partial.experience
    : mockProfile.experience;
  const education = Array.isArray(partial.education) && partial.education.length
    ? partial.education
    : mockProfile.education;

  const prefs = isObject(partial.preferences) ? partial.preferences : {};

  return {
    ...mockProfile,
    ...partial,
    fullName: partial.fullName?.trim() || mockProfile.fullName,
    headline: partial.headline?.trim() || mockProfile.headline,
    email: partial.email?.trim() || mockProfile.email,
    phone: partial.phone?.trim() || mockProfile.phone,
    location: partial.location?.trim() || mockProfile.location,
    summary: partial.summary?.trim() || mockProfile.summary,
    yearsOfExperience:
      typeof partial.yearsOfExperience === "number"
        ? partial.yearsOfExperience
        : mockProfile.yearsOfExperience,
    avatarInitials: partial.avatarInitials?.trim() || mockProfile.avatarInitials,
    skills,
    experience,
    education,
    preferences: {
      ...mockProfile.preferences,
      ...(prefs as Partial<Profile["preferences"]>),
      salaryMin:
        typeof (prefs as { salaryMin?: unknown }).salaryMin === "number"
          ? (prefs as { salaryMin: number }).salaryMin
          : mockProfile.preferences.salaryMin,
      salaryMax:
        typeof (prefs as { salaryMax?: unknown }).salaryMax === "number"
          ? (prefs as { salaryMax: number }).salaryMax
          : mockProfile.preferences.salaryMax,
    },
    masterCv: {
      ...mockProfile.masterCv,
      ...(isObject(partial.masterCv) ? partial.masterCv : {}),
    },
  };
}
