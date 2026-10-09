-- Staging-only baseline derived from the production catalog on 2026-10-10.
-- It recreates schema and policies only. It contains no production rows or IDs.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.teams (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  name text not null,
  "shortName" text not null default ''::text,
  abbreviation text not null default ''::text,
  logo text,
  "visualStyle" text not null default 'solid'::text,
  "primaryColor" text not null default 'black'::text,
  "secondaryColor" text,
  "jerseyNumberColor" text not null default 'white'::text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  "externalTeamId" integer,
  constraint teams_pkey primary key (user_id, id)
);

create table public.players (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  "teamId" text not null default ''::text,
  "teamIds" text[] not null default '{}'::text[],
  name text not null,
  "fullName" text,
  "displayName" text,
  position text not null,
  number integer not null,
  rating numeric,
  "externalPlayerId" jsonb,
  "photoUrl" text,
  image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_pkey primary key (user_id, id)
);

create table public.matches (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  season text not null,
  "matchDay" integer not null,
  date text not null,
  formation text,
  "homeAway" text,
  "homeTeamId" text not null,
  "awayTeamId" text not null,
  "teamId" text,
  "opponentName" text,
  "manOfMatchPlayerId" text,
  duration integer not null,
  appearances jsonb not null default '[]'::jsonb,
  events jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matches_pkey primary key (user_id, id)
);

create index teams_user_id_idx on public.teams using btree (user_id);
create index players_user_id_idx on public.players using btree (user_id);
create index players_user_team_id_idx on public.players using btree (user_id, "teamId");
create index matches_user_id_idx on public.matches using btree (user_id);
create index matches_user_date_idx on public.matches using btree (user_id, date);
create index matches_user_season_match_day_idx on public.matches using btree (user_id, season, "matchDay");

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;

create policy teams_select_own on public.teams for select to authenticated using (user_id = auth.uid());
create policy teams_insert_own on public.teams for insert to authenticated with check (user_id = auth.uid());
create policy teams_update_own on public.teams for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy teams_delete_own on public.teams for delete to authenticated using (user_id = auth.uid());
create policy players_select_own on public.players for select to authenticated using (user_id = auth.uid());
create policy players_insert_own on public.players for insert to authenticated with check (user_id = auth.uid());
create policy players_update_own on public.players for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy players_delete_own on public.players for delete to authenticated using (user_id = auth.uid());
create policy matches_select_own on public.matches for select to authenticated using (user_id = auth.uid());
create policy matches_insert_own on public.matches for insert to authenticated with check (user_id = auth.uid());
create policy matches_update_own on public.matches for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy matches_delete_own on public.matches for delete to authenticated using (user_id = auth.uid());

-- This mirrors the grants observed on production's legacy tables. RLS policies
-- still limit authenticated row access; anonymous role has no matching policy.
grant all privileges on table public.teams, public.players, public.matches to anon, authenticated;

create trigger teams_set_updated_at before update on public.teams for each row execute function public.set_updated_at();
create trigger players_set_updated_at before update on public.players for each row execute function public.set_updated_at();
create trigger matches_set_updated_at before update on public.matches for each row execute function public.set_updated_at();
