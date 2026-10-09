-- Staging-only cutover rehearsal. Apply only after v2.5.4 is active and
-- clients that still depend on legacy-table writes have been retired.
revoke insert, update, delete, truncate, references, trigger
  on table public.teams, public.players, public.matches, public.competition_states
  from anon, authenticated;
grant select on table public.teams, public.players, public.matches, public.competition_states
  to authenticated;
