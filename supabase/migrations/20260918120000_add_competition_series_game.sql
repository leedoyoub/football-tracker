alter table matches add column if not exists competition_series_game integer;
alter table matches add column if not exists competition_assignment jsonb;
