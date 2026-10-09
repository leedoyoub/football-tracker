-- Revisioned cloud sync ledger. This migration is additive; legacy entity
-- tables remain available as the one-time bootstrap source for upgraded apps.

create table if not exists public.competition_states (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  season text not null,
  kind text not null check (kind in ('champions-draw', 'season-complete')),
  team_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.competition_states enable row level security;
drop policy if exists "Users can read own competition states" on public.competition_states;
create policy "Users can read own competition states" on public.competition_states
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own competition states" on public.competition_states;
create policy "Users can insert own competition states" on public.competition_states
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Users can update own competition states" on public.competition_states;
create policy "Users can update own competition states" on public.competition_states
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users can delete own competition states" on public.competition_states;
create policy "Users can delete own competition states" on public.competition_states
  for delete to authenticated using ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.competition_states to authenticated;

create table if not exists public.cloud_sync_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_sync_entities (
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('team', 'player', 'match', 'competition')),
  entity_id text not null,
  revision bigint not null check (revision >= 0),
  deleted boolean not null default false,
  payload jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, entity_type, entity_id),
  constraint cloud_sync_entities_payload_check check (
    (deleted and payload is null)
    or (not deleted and payload is not null and jsonb_typeof(payload) = 'object' and payload ->> 'id' = entity_id)
  )
);

alter table public.cloud_sync_state enable row level security;
alter table public.cloud_sync_entities enable row level security;

drop policy if exists "Users can read own cloud sync state" on public.cloud_sync_state;
create policy "Users can read own cloud sync state" on public.cloud_sync_state
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own cloud sync state" on public.cloud_sync_state;
drop policy if exists "Users can update own cloud sync state" on public.cloud_sync_state;

drop policy if exists "Users can read own cloud sync entities" on public.cloud_sync_entities;
create policy "Users can read own cloud sync entities" on public.cloud_sync_entities
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Users can insert own cloud sync entities" on public.cloud_sync_entities;
drop policy if exists "Users can update own cloud sync entities" on public.cloud_sync_entities;

-- Clients can read their own ledger rows; all mutations go through the RPCs.
revoke all on public.cloud_sync_state, public.cloud_sync_entities from anon, authenticated;
grant select on public.cloud_sync_state, public.cloud_sync_entities to authenticated;

-- The helpers need elevated table privileges after direct DML is revoked. Keep
-- them outside the exposed public schema and expose only authenticated wrappers.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.initialize_cloud_sync(p_entities jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_item jsonb;
  v_entity_type text;
  v_entity_id text;
  v_payload jsonb;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_entities is null or jsonb_typeof(p_entities) <> 'array' or jsonb_array_length(p_entities) > 100000 then
    raise exception 'Invalid cloud sync bootstrap payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  select revision into v_revision from public.cloud_sync_state where user_id = v_user_id for update;
  if found then
    return jsonb_build_object('initialized', false, 'revision', v_revision);
  end if;

  -- Legacy rows are the initial revision-0 baseline. A queued local edit whose
  -- base is also 0 can then be conditionally committed as the first change.
  v_revision := 0;
  insert into public.cloud_sync_state(user_id, revision) values (v_user_id, v_revision);
  for v_item in select value from pg_catalog.jsonb_array_elements(p_entities) loop
    v_entity_type := v_item ->> 'entityType';
    v_entity_id := v_item ->> 'entityId';
    v_payload := v_item -> 'payload';
    if v_entity_type is null or v_entity_type not in ('team', 'player', 'match', 'competition')
      or v_entity_id is null or v_entity_id = ''
      or v_payload is null or jsonb_typeof(v_payload) <> 'object'
      or v_payload ->> 'id' is distinct from v_entity_id then
      raise exception 'Invalid cloud sync bootstrap entity';
    end if;
    insert into public.cloud_sync_entities(user_id, entity_type, entity_id, revision, deleted, payload)
      values (v_user_id, v_entity_type, v_entity_id, v_revision, false, v_payload);
    v_count := v_count + 1;
  end loop;
  return pg_catalog.jsonb_build_object('initialized', true, 'revision', v_revision, 'entityCount', v_count);
end;
$$;

create or replace function private.commit_cloud_sync(p_expected_revision bigint, p_mutations jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_revision bigint;
  v_next_revision bigint;
  v_item jsonb;
  v_entity_type text;
  v_entity_id text;
  v_operation text;
  v_payload jsonb;
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or p_mutations is null or jsonb_typeof(p_mutations) <> 'array'
    or jsonb_array_length(p_mutations) > 100000 then
    raise exception 'Invalid cloud sync commit payload';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  select revision into v_revision from public.cloud_sync_state where user_id = v_user_id for update;
  if not found then
    return pg_catalog.jsonb_build_object('applied', false, 'revision', null);
  end if;
  if v_revision <> p_expected_revision then
    return pg_catalog.jsonb_build_object('applied', false, 'revision', v_revision);
  end if;

  v_count := pg_catalog.jsonb_array_length(p_mutations);
  if v_count = 0 then
    return pg_catalog.jsonb_build_object('applied', true, 'revision', v_revision);
  end if;
  v_next_revision := v_revision + 1;

  for v_item in select value from pg_catalog.jsonb_array_elements(p_mutations) loop
    v_entity_type := v_item ->> 'entityType';
    v_entity_id := v_item ->> 'entityId';
    v_operation := v_item ->> 'operation';
    v_payload := v_item -> 'payload';
    if v_entity_type is null or v_entity_type not in ('team', 'player', 'match', 'competition')
      or v_entity_id is null or v_entity_id = ''
      or v_operation is null or v_operation not in ('upsert', 'delete')
      or (v_operation = 'upsert' and (v_payload is null or jsonb_typeof(v_payload) <> 'object' or v_payload ->> 'id' is distinct from v_entity_id)) then
      raise exception 'Invalid cloud sync mutation';
    end if;
    insert into public.cloud_sync_entities(user_id, entity_type, entity_id, revision, deleted, payload)
      values (v_user_id, v_entity_type, v_entity_id, v_next_revision, v_operation = 'delete', case when v_operation = 'delete' then null else v_payload end)
      on conflict (user_id, entity_type, entity_id) do update set
        revision = excluded.revision,
        deleted = excluded.deleted,
        payload = excluded.payload,
        updated_at = now();
  end loop;
  update public.cloud_sync_state set revision = v_next_revision, updated_at = now() where user_id = v_user_id;
  return pg_catalog.jsonb_build_object('applied', true, 'revision', v_next_revision);
end;
$$;

create or replace function public.initialize_cloud_sync(p_entities jsonb)
returns jsonb
language sql
set search_path = pg_catalog
as $$ select private.initialize_cloud_sync(p_entities) $$;

create or replace function public.commit_cloud_sync(p_expected_revision bigint, p_mutations jsonb)
returns jsonb
language sql
set search_path = pg_catalog
as $$ select private.commit_cloud_sync(p_expected_revision, p_mutations) $$;

revoke all on function private.initialize_cloud_sync(jsonb) from public, anon;
revoke all on function private.commit_cloud_sync(bigint, jsonb) from public, anon;
grant execute on function private.initialize_cloud_sync(jsonb) to authenticated;
grant execute on function private.commit_cloud_sync(bigint, jsonb) to authenticated;
revoke all on function public.initialize_cloud_sync(jsonb) from public, anon;
revoke all on function public.commit_cloud_sync(bigint, jsonb) from public, anon;
grant execute on function public.initialize_cloud_sync(jsonb) to authenticated;
grant execute on function public.commit_cloud_sync(bigint, jsonb) to authenticated;
