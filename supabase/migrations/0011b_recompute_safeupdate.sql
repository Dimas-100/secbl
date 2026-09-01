-- Follow-up to 0011_rating_recompute.sql (already applied — not edited here).
-- Supabase preloads the `safeupdate` extension on the `authenticator` role
-- that every PostgREST call rides on (session_preload_libraries includes
-- `safeupdate` on that role). It rejects an unqualified DELETE at execution
-- time; SECURITY DEFINER does not exempt it. The previous
-- `delete from rating_history;` therefore failed on every call this function
-- ever received through the API -- the whole rating-recompute path
-- (recording or voiding a tournament result) was dead in production.
create or replace function public.apply_rating_recompute(
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  -- Serializes against every other rating write. Without it a recompute could
  -- interleave with a confirmation and persist a ladder built from a stale read.
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  update profiles p
  set rating = s.rating,
      matches_played = s.matches_played
  from jsonb_to_recordset(p_standings)
    as s(profile_id uuid, rating int, matches_played int)
  where p.id = s.profile_id;

  -- Every row, but with a genuine qualification. Supabase preloads the
  -- `safeupdate` extension on the `authenticator` role, and it rejects an
  -- unqualified DELETE at execution time -- SECURITY DEFINER does not exempt
  -- it, so the previous `delete from rating_history;` failed on every call
  -- made through PostgREST. rating_history.match_id is NOT NULL and
  -- FK-constrained, so this still clears the table.
  -- `where true` and `where match_id is not null` do NOT work: Postgres
  -- constant-folds them away and the plan is unqualified again.
  delete from rating_history where match_id in (select id from matches);
  insert into rating_history (profile_id, match_id, rating_before, rating_after)
  select h.profile_id, h.match_id, h.rating_before, h.rating_after
  from jsonb_to_recordset(p_history)
    as h(profile_id uuid, match_id uuid, rating_before int, rating_after int);

  update matches m
  set rating_delta_reporter = d.rating_delta_reporter,
      rating_delta_opponent = d.rating_delta_opponent
  from jsonb_to_recordset(p_deltas)
    as d(match_id uuid, rating_delta_reporter int, rating_delta_opponent int)
  where m.id = d.match_id;
end;
$$;
