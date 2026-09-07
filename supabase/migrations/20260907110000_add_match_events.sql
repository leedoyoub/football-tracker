-- Add match_events table to support historical integrity of match events
create table match_events (
  id text primary key,
  match_id text references matches(id) on delete cascade,
  user_id uuid references auth.users not null,
  event_type text not null,
  minute integer not null,
  team_id text not null,
  player_id text,
  assist_player_id text,
  event_data jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table match_events enable row level security;
create policy "Users can read own match_events" on match_events for select using (auth.uid() = user_id);
create policy "Users can insert own match_events" on match_events for insert with check (auth.uid() = user_id);
create policy "Users can update own match_events" on match_events for update using (auth.uid() = user_id);
create policy "Users can delete own match_events" on match_events for delete using (auth.uid() = user_id);
