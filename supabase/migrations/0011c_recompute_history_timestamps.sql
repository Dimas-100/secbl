-- Carries each match's own confirmed_at through a rating recompute instead of
-- letting the rebuilt rating_history rows fall back to the transaction's
-- now(). Without this, apply_rating_recompute deletes every rating_history
-- row and reinserts with created_at defaulting to now() — since now() is
-- fixed for the whole transaction, every row in the table ends up sharing one
-- identical timestamp, and app/(member)/players/[id]/page.tsx's
-- .order("created_at", { ascending: false }).limit(20) has no fallback sort
-- key (rating_history.id is a random uuid), so the "450 -> 466 (+16)" chain
-- stops being chronological and the original order is unrecoverable.
create or replace function public.apply_rating_recompute(p_standings jsonb, p_history jsonb, p_deltas jsonb)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  update profiles p
  set rating = s.rating,
      matches_played = s.matches_played
  from jsonb_to_recordset(p_standings)
    as s(profile_id uuid, rating int, matches_played int)
  where p.id = s.profile_id;

  -- Every row, but with a genuine qualification: Supabase preloads the
  -- `safeupdate` extension on the `authenticator` role and it rejects an
  -- unqualified DELETE at execution time. `where true` would be constant-folded
  -- away and fail the same way.
  delete from rating_history where match_id in (select id from matches);

  insert into rating_history (profile_id, match_id, rating_before, rating_after, created_at)
  select h.profile_id, h.match_id, h.rating_before, h.rating_after, h.created_at
  from jsonb_to_recordset(p_history)
    as h(profile_id uuid, match_id uuid, rating_before int, rating_after int, created_at timestamptz);

  update matches m
  set rating_delta_reporter = d.rating_delta_reporter,
      rating_delta_opponent = d.rating_delta_opponent
  from jsonb_to_recordset(p_deltas)
    as d(match_id uuid, rating_delta_reporter int, rating_delta_opponent int)
  where m.id = d.match_id;
end;
$function$
