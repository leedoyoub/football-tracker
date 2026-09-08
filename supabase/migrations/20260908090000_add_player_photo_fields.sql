-- Optional provider references only. Existing player.id remains the primary identity.
alter table players add column if not exists external_player_id text;
alter table players add column if not exists photo_url text;
