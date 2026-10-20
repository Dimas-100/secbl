-- Agreed results: the scorekeeper can count a game on the spot when both
-- players agree, and the opponent can take it back out within 24 hours.
-- Design: docs/superpowers/specs/2026-10-20-agreed-results-design.md

-- ---------------------------------------------------------------------------
-- 1. The marker. Set only by apply_agreed_confirmation (below); it
--    opens the 24-hour window. Normal, cup and admin-resolved confirmations
--    leave it null.
-- ---------------------------------------------------------------------------
alter table public.matches add column agreed_at timestamptz;

-- A member must not be able to insert a report that already carries it.
alter policy "approved report own matches" on public.matches
  with check (
    public.is_approved()
    and reporter_id = (select auth.uid())
    and status = 'pending'
    and tournament_match_id is null
    and agreed_at is null
  );

-- ---------------------------------------------------------------------------
-- 2. Confirmation with the agreed stamp. A wrapper rather than a new
--    parameter on apply_match_confirmation: that function stays exactly as
--    deployed, and an overload would make PostgREST's named-argument call
--    ambiguous. One call, one transaction: the stamp can never be missing
--    from a game this function confirmed.
-- ---------------------------------------------------------------------------
create function public.apply_agreed_confirmation(
  p_match_id uuid,
  p_reporter_delta int,
  p_opponent_delta int
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform public.apply_match_confirmation(p_match_id, p_reporter_delta, p_opponent_delta);
  update matches set agreed_at = now() where id = p_match_id;
end;
$$;

revoke execute on function public.apply_agreed_confirmation(uuid, int, int)
  from public, anon, authenticated;
grant execute on function public.apply_agreed_confirmation(uuid, int, int)
  to service_role;

-- ---------------------------------------------------------------------------
-- 3. "Not right?" — the opponent takes an agreed game back out within 24
--    hours. The game becomes 'disputed' (the existing admin Disputes card
--    takes it from there) and the ladder is rebuilt without it, the same way
--    void_tournament_result does.
--
--    SERVICE ROLE ONLY. The payload guard below checks which matches the
--    recompute covers, not the ratings in it, so granting this to members
--    would let anyone who can flag a game write any rating into the ladder.
--    The server action passes the signed-in opponent as p_opponent_id
--    (auth.uid() is null under the service role).
-- ---------------------------------------------------------------------------
create function public.undo_agreed_match(
  p_match_id uuid,
  p_opponent_id uuid,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb,
  p_expected_confirmed int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  m matches%rowtype;
begin
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  -- The ladder read that produced the payload happened before this lock. If
  -- the confirmed-match count has since moved, that read is stale.
  if (select count(*) from matches where status = 'confirmed') <> p_expected_confirmed then
    raise exception 'the ladder changed while this result was being prepared — try again';
  end if;

  select * into m from matches where id = p_match_id for update;
  if not found
     or m.status <> 'confirmed'
     or m.agreed_at is null
     or m.tournament_match_id is not null then
    raise exception 'that game is not an agreed result';
  end if;
  if m.opponent_id is distinct from p_opponent_id then
    raise exception 'only the opponent can flag this game';
  end if;
  if not exists (select 1 from profiles where id = p_opponent_id and status = 'approved') then
    raise exception 'your account is not active';
  end if;
  if m.confirmed_at <= now() - interval '24 hours' then
    raise exception 'the 24 hours to flag this game are up';
  end if;

  -- Leaving 'confirmed' fires matches_activity, which deletes every feed row
  -- for the match (result, badge, streak, pass).
  update matches
  set status = 'disputed',
      confirmed_at = null,
      agreed_at = null,
      rating_delta_reporter = null,
      rating_delta_opponent = null
  where id = p_match_id;

  -- The ladder we are about to write must describe exactly the confirmed
  -- matches that now exist: same count, same ids. jsonb_array_length of a
  -- null p_deltas is null, so the null check comes first.
  if p_deltas is null
     or (select count(*) from matches where status = 'confirmed') <> jsonb_array_length(p_deltas)
     or exists (
       select 1 from matches mm
       where mm.status = 'confirmed'
         and not exists (
           select 1 from jsonb_to_recordset(p_deltas) as d(match_id uuid)
           where d.match_id = mm.id
         )
     ) then
    raise exception 'recompute payload does not match the confirmed matches — try again';
  end if;

  perform public.apply_rating_recompute(p_standings, p_history, p_deltas);
end;
$$;

revoke execute on function public.undo_agreed_match(uuid, uuid, jsonb, jsonb, jsonb, int)
  from public, anon, authenticated;
grant execute on function public.undo_agreed_match(uuid, uuid, jsonb, jsonb, jsonb, int)
  to service_role;
