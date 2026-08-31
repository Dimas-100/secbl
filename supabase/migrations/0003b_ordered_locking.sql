-- Applies a confirmed match atomically: both ratings, both history rows,
-- match status. Deltas are computed by the trusted server (lib/rating.ts);
-- only the service role may execute this. Profile rows are locked in
-- canonical id order to avoid ABBA deadlocks between concurrent
-- confirmations of swapped-role matches.
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
