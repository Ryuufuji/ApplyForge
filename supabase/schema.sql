-- ============================================================================
-- APPLYFORGE — Schéma Supabase
-- Profils, offres, candidatures (historique) et documents (CV / lettres).
-- Exécuter dans le SQL Editor de ton projet Supabase.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- PROFILES
create table if not exists public.profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null unique references auth.users (id) on delete cascade,
  full_name         text not null,
  headline          text,
  email             text,
  phone             text,
  location          text,
  years_experience  int default 0,
  summary           text,
  skills            jsonb not null default '[]'::jsonb,       -- [{name, level, years, category}]
  experience        jsonb not null default '[]'::jsonb,
  education         jsonb not null default '[]'::jsonb,
  preferences       jsonb not null default '{}'::jsonb,       -- secteurs, contrats, remote, salaire…
  master_cv_path    text,
  cover_letter_base text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ------------------------------------------------------------------ OFFERS
create table if not exists public.offers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users (id) on delete cascade,
  external_id   text,
  title         text not null,
  company       text not null,
  location      text,
  remote        text,
  contract      text,
  salary        text,
  source        text,
  url           text,
  tone          text,
  description   text,
  requirements  jsonb default '[]'::jsonb,
  keywords      jsonb default '[]'::jsonb,
  raw_text      text,
  scraped_at    timestamptz default now(),
  unique (user_id, external_id)
);

-- ----------------------------------------------------------- APPLICATIONS
create table if not exists public.applications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  offer_id     uuid references public.offers (id) on delete set null,
  title        text not null,
  company      text not null,
  location     text,
  contract     text,
  salary       text,
  match_score  int check (match_score between 0 and 100),
  status       text not null default 'preparation'
               check (status in ('preparation','postule','relance','entretien','refus','accepte')),
  channel      text default 'formulaire'
               check (channel in ('email','formulaire','quick-grabber','linkedin')),
  applied_at   timestamptz,
  follow_up_at timestamptz,          -- relance automatique J+7
  events       jsonb not null default '[]'::jsonb,   -- journal horodaté
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists applications_user_status_idx on public.applications (user_id, status);
create index if not exists applications_follow_up_idx    on public.applications (follow_up_at)
  where status in ('postule','relance');

-- --------------------------------------------------------------- DOCUMENTS
create table if not exists public.documents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text check (kind in ('cv','lettre','relance')) default 'cv',
  storage_path text not null,
  public_url  text,
  file_name   text,
  size_bytes  int,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- TRIGGER
create or replace function public.touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_applications_touch on public.applications;
create trigger trg_applications_touch before update on public.applications
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ----------------------------------------------------------------- RLS
alter table public.profiles     enable row level security;
alter table public.offers       enable row level security;
alter table public.applications enable row level security;
alter table public.documents    enable row level security;

create policy "own profile"  on public.profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own offers"   on public.offers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own apps"     on public.applications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own docs"     on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ----------------------------------------------------- STORAGE (bucket)
-- Créer un bucket nommé "documents" (public ou signé), puis :
-- insert into storage.buckets (id, name, public) values ('documents','documents', true)
--   on conflict (id) do nothing;

-- --------------------------------------- RELANCE AUTO (pg_cron, optionnel)
-- Envoie une notification quotidienne des candidatures à relancer :
-- select cron.schedule(
--   'applyforge-followups',
--   '0 8 * * *',
--   $$ update public.applications
--        set status = 'relance'
--        where follow_up_at < now()
--          and status in ('postule') $$
-- );
