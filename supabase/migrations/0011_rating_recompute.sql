-- Rewrites the entire ladder from a replay computed by lib/rating.ts.
-- The maths lives in TypeScript so there is exactly one definition of it;
-- this function's only job is to land the result atomically.
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

  delete from rating_history;
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

revoke execute on function public.apply_rating_recompute(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_rating_recompute(jsonb, jsonb, jsonb)
  to service_role;

-- Same body as before plus the advisory lock, so ordinary confirmations
-- serialize against recomputes.
create or replace function public.apply_match_confirmation(
  p_match_id uuid,
  p_reporter_delta int,
  p_opponent_delta int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  m matches%rowtype;
  r_before int;
  o_before int;
  r_after int;
  o_after int;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  select * into m from matches where id = p_match_id and status = 'pending' for update;
  if not found then
    raise exception 'match % is not pending', p_match_id;
  end if;

  -- Lock both profile rows in canonical id order to avoid ABBA deadlocks
  -- between concurrent confirmations of swapped-role matches.
  perform 1 from profiles where id in (m.reporter_id, m.opponent_id)
    order by id for update;

  select rating into r_before from profiles where id = m.reporter_id;
  select rating into o_before from profiles where id = m.opponent_id;
  r_after := greatest(100, r_before + p_reporter_delta);
  o_after := greatest(100, o_before + p_opponent_delta);

  update profiles set rating = r_after, matches_played = matches_played + 1
    where id = m.reporter_id;
  update profiles set rating = o_after, matches_played = matches_played + 1
    where id = m.opponent_id;

  insert into rating_history (profile_id, match_id, rating_before, rating_after)
  values
    (m.reporter_id, p_match_id, r_before, r_after),
    (m.opponent_id, p_match_id, o_before, o_after);

  update matches
  set status = 'confirmed',
      confirmed_at = now(),
      rating_delta_reporter = r_after - r_before,
      rating_delta_opponent = o_after - o_before
  where id = p_match_id;
end;
$$;
