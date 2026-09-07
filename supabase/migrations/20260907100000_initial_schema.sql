-- Enable RLS (already enabled by default in Supabase)

-- Tables
create table teams (
  id text primary key,
  user_id uuid references auth.users not null,
  name text not null,
  abbreviation text not null,
  color text not null,
  visual_style text,
  primary_color text,
  secondary_color text,
  jersey_number_color text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table players (
  id text primary key,
  user_id uuid references auth.users not null,
  name text not null,
  full_name text,
  display_name text,
  position text not null,
  number integer not null,
  rating float,
  image text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Relationship table for multi-team support
create table player_teams (
  player_id text references players(id) on delete cascade,
  team_id text references teams(id) on delete cascade,
  user_id uuid references auth.users not null,
  primary key (player_id, team_id)
);

create table matches (
  id text primary key,
  user_id uuid references auth.users not null,
  season text not null,
  match_day integer not null,
  date timestamp with time zone not null,
  home_team_id text references teams(id),
  away_team_id text references teams(id),
  duration integer not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- RLS Policies
alter table teams enable row level security;
create policy "Users can read own teams" on teams for select using (auth.uid() = user_id);
create policy "Users can insert own teams" on teams for insert with check (auth.uid() = user_id);
create policy "Users can update own teams" on teams for update using (auth.uid() = user_id);
create policy "Users can delete own teams" on teams for delete using (auth.uid() = user_id);

alter table players enable row level security;
create policy "Users can read own players" on players for select using (auth.uid() = user_id);
create policy "Users can insert own players" on players for insert with check (auth.uid() = user_id);
create policy "Users can update own players" on players for update using (auth.uid() = user_id);
create policy "Users can delete own players" on players for delete using (auth.uid() = user_id);

alter table player_teams enable row level security;
create policy "Users can read own player_teams" on player_teams for select using (auth.uid() = user_id);
create policy "Users can insert own player_teams" on player_teams for insert with check (auth.uid() = user_id);

alter table matches enable row level security;
create policy "Users can read own matches" on matches for select using (auth.uid() = user_id);
create policy "Users can insert own matches" on matches for insert with check (auth.uid() = user_id);
create policy "Users can update own matches" on matches for update using (auth.uid() = user_id);
create policy "Users can delete own matches" on matches for delete using (auth.uid() = user_id);
