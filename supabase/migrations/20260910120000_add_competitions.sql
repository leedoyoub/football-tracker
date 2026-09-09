alter table matches add column if not exists competition_type text;
alter table matches add column if not exists competition_stage text;
alter table matches add column if not exists competition_pairing_id text;

create table if not exists competition_states (
  id text primary key,
  user_id uuid references auth.users not null,
  season text not null,
  kind text not null,
  team_ids jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

alter table competition_states enable row level security;
create policy "Users can read own competition states" on competition_states for select using (auth.uid() = user_id);
create policy "Users can insert own competition states" on competition_states for insert with check (auth.uid() = user_id);
create policy "Users can update own competition states" on competition_states for update using (auth.uid() = user_id);
create policy "Users can delete own competition states" on competition_states for delete using (auth.uid() = user_id);
