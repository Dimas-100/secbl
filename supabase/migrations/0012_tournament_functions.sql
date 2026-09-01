-- Every tournament write lives here. The tables carry read-only policies, so
-- these functions are the only way in, and each re-checks is_admin() itself.

create or replace function public.create_tournament(p_name text, p_event_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'only admins can create tournaments';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'tournament needs a name';
  end if;
  insert into tournaments (name, event_id, created_by)
  values (trim(p_name), p_event_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Replaces the entrant list wholesale, which keeps seeding a single atomic
-- write rather than a sequence of adds and re-seeds that could half-apply.
create or replace function public.set_tournament_entrants(
  p_tournament_id uuid,
  p_entrants jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status tournament_status;
begin
  if not public.is_admin() then
    raise exception 'only admins can change entrants';
  end if;
  select status into v_status from tournaments where id = p_tournament_id for update;
  if not found then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'setup' then
    raise exception 'entrants are fixed once a tournament starts';
  end if;

  delete from tournament_players where tournament_id = p_tournament_id;
  insert into tournament_players (tournament_id, profile_id, seed)
  select p_tournament_id, e.profile_id, e.seed
  from jsonb_to_recordset(p_entrants) as e(profile_id uuid, seed int);
end;
$$;

create or replace function public.start_tournament(
  p_tournament_id uuid,
  p_matches jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_status tournament_status;
  v_players int;
begin
  if not public.is_admin() then
    raise exception 'only admins can start a tournament';
  end if;
  select status into v_status from tournaments where id = p_tournament_id for update;
  if v_status is null then
    raise exception 'tournament not found';
  end if;
  if v_status <> 'setup' then
    raise exception 'tournament has already started';
  end if;
  select count(*) into v_players from tournament_players where tournament_id = p_tournament_id;
  if v_players < 3 then
    raise exception 'a tournament needs at least 3 entrants';
  end if;

  -- Two passes: rows first, then the self-referencing advance links. Doing it
  -- this way keeps the foreign keys non-deferrable.
  insert into tournament_matches (
    id, tournament_id, bracket, round, position,
    player1_id, player2_id, winner_id
  )
  select m.id, p_tournament_id, 'winners', m.round, m.position,
         m.player1_id, m.player2_id, m.winner_id
  from jsonb_to_recordset(p_matches) as m(
    id uuid, round int, position int,
    player1_id uuid, player2_id uuid, winner_id uuid
  );

  update tournament_matches t
  set winner_advances_to = m.winner_advances_to,
      winner_advances_slot = m.winner_advances_slot
  from jsonb_to_recordset(p_matches) as m(
    id uuid, winner_advances_to uuid, winner_advances_slot smallint
  )
  where t.id = m.id and t.tournament_id = p_tournament_id;

  update tournaments
  set status = 'live', started_at = now()
  where id = p_tournament_id;
end;
$$;

-- Records a result and rebuilds the ladder in one transaction, so the
-- invariant "ratings equal a replay of confirmed matches" is never violated,
-- not even briefly between two statements.
--
-- p_expected_confirmed guards a stale-read window: lib/recompute.ts SELECTs
-- every confirmed match to build p_standings/p_history/p_deltas BEFORE this
-- function acquires the rating advisory lock. If another confirmation landed
-- in that window, the payload we were handed is already wrong, and
-- apply_rating_recompute would otherwise silently rebuild the whole ladder
-- (it deletes all of rating_history, no WHERE) from a stale replay.
create or replace function public.record_tournament_result(
  p_tournament_match_id uuid,
  p_match_id uuid,
  p_player1_score int,
  p_player2_score int,
  p_winner_id uuid,
  p_played_at date,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb,
  p_expected_confirmed int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
  v_status tournament_status;
  v_loser uuid;
  v_remaining int;
begin
  if not public.is_admin() then
    raise exception 'only admins can record results';
  end if;
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  -- The ladder read that produced p_standings/p_history/p_deltas happened
  -- before we held this lock. If the confirmed-match count has since moved,
  -- that read is stale — refuse rather than land a recompute that silently
  -- drops whatever changed underneath it.
  if (select count(*) from matches where status = 'confirmed') <> p_expected_confirmed then
    raise exception 'the ladder changed while this result was being prepared — try again';
  end if;

  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  select status into v_status from tournaments where id = tm.tournament_id for update;
  if v_status <> 'live' then
    raise exception 'tournament is not live';
  end if;
  if tm.player1_id is null or tm.player2_id is null then
    raise exception 'both players must be known before a result can be recorded';
  end if;
  if tm.winner_id is not null then
    raise exception 'that match already has a result';
  end if;
  if p_winner_id is distinct from tm.player1_id and p_winner_id is distinct from tm.player2_id then
    raise exception 'winner must be one of the two players';
  end if;
  if p_player1_score = p_player2_score then
    raise exception 'a tournament match cannot end level';
  end if;

  v_loser := case when p_winner_id = tm.player1_id then tm.player2_id else tm.player1_id end;

  -- The rated match. tournament_match_id is what the matches insert policy
  -- forbids clients from setting, which is why this runs here.
  insert into matches (
    id, reporter_id, opponent_id, winner_id,
    reporter_score, opponent_score, game_type, status,
    tournament_match_id, played_at, confirmed_at
  ) values (
    p_match_id, tm.player1_id, tm.player2_id, p_winner_id,
    p_player1_score, p_player2_score, '8ball', 'confirmed',
    p_tournament_match_id, p_played_at, now()
  );

  update tournament_matches
  set player1_score = p_player1_score,
      player2_score = p_player2_score,
      winner_id = p_winner_id
  where id = p_tournament_match_id;

  if tm.winner_advances_to is not null then
    if tm.winner_advances_slot = 1 then
      update tournament_matches set player1_id = p_winner_id where id = tm.winner_advances_to;
    else
      update tournament_matches set player2_id = p_winner_id where id = tm.winner_advances_to;
    end if;
  end if;

  -- The ladder we are about to write must describe exactly the confirmed
  -- matches that now exist: same count, same ids. A bare count would miss a
  -- simultaneous confirm and void cancelling each other out.
  if (select count(*) from matches where status = 'confirmed') <> jsonb_array_length(p_deltas)
     or exists (
       select 1 from matches m
       where m.status = 'confirmed'
         and not exists (
           select 1 from jsonb_to_recordset(p_deltas) as d(match_id uuid)
           where d.match_id = m.id
         )
     ) then
    raise exception 'recompute payload does not match the confirmed matches — try again';
  end if;

  perform public.apply_rating_recompute(p_standings, p_history, p_deltas);

  select count(*) into v_remaining
  from tournament_matches
  where tournament_id = tm.tournament_id and winner_id is null;
  if v_remaining = 0 then
    update tournaments set status = 'complete', completed_at = now()
    where id = tm.tournament_id;
  end if;
end;
$$;

-- Undoes one result. Refused when the winner has already played on, because
-- cascading an un-advancement through a decided subtree would silently discard
-- results the club actually played.
--
-- p_expected_confirmed guards the same stale-read window as
-- record_tournament_result — see the comment there.
create or replace function public.void_tournament_result(
  p_tournament_match_id uuid,
  p_standings jsonb,
  p_history jsonb,
  p_deltas jsonb,
  p_expected_confirmed int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
  v_downstream_decided boolean;
begin
  if not public.is_admin() then
    raise exception 'only admins can void results';
  end if;
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  -- The ladder read that produced p_standings/p_history/p_deltas happened
  -- before we held this lock. If the confirmed-match count has since moved,
  -- that read is stale — refuse rather than land a recompute that silently
  -- drops whatever changed underneath it.
  if (select count(*) from matches where status = 'confirmed') <> p_expected_confirmed then
    raise exception 'the ladder changed while this result was being prepared — try again';
  end if;

  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  if tm.winner_id is null then
    raise exception 'that match has no result to void';
  end if;

  if tm.winner_advances_to is not null then
    select winner_id is not null into v_downstream_decided
    from tournament_matches where id = tm.winner_advances_to;
    if v_downstream_decided then
      raise exception 'void the later match first — its result depends on this one';
    end if;
    if tm.winner_advances_slot = 1 then
      update tournament_matches set player1_id = null where id = tm.winner_advances_to;
    else
      update tournament_matches set player2_id = null where id = tm.winner_advances_to;
    end if;
  end if;

  delete from matches where tournament_match_id = p_tournament_match_id;

  update tournament_matches
  set winner_id = null, player1_score = null, player2_score = null
  where id = p_tournament_match_id;

  update tournaments set status = 'live', completed_at = null
  where id = tm.tournament_id and status = 'complete';

  -- The ladder we are about to write must describe exactly the confirmed
  -- matches that now exist: same count, same ids. A bare count would miss a
  -- simultaneous confirm and void cancelling each other out.
  if (select count(*) from matches where status = 'confirmed') <> jsonb_array_length(p_deltas)
     or exists (
       select 1 from matches m
       where m.status = 'confirmed'
         and not exists (
           select 1 from jsonb_to_recordset(p_deltas) as d(match_id uuid)
           where d.match_id = m.id
         )
     ) then
    raise exception 'recompute payload does not match the confirmed matches — try again';
  end if;

  perform public.apply_rating_recompute(p_standings, p_history, p_deltas);
end;
$$;

-- Score-only correction. Note what this deliberately does NOT do: recompute.
-- A rating depends only on WHO won (ratingUpdate takes a boolean), never on the
-- score, so fixing "5-3" to "5-2" cannot move the ladder. That is why this is
-- always allowed even when the winner has already played on, while changing a
-- winner has to go through void.
create or replace function public.correct_tournament_scores(
  p_tournament_match_id uuid,
  p_player1_score int,
  p_player2_score int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
begin
  if not public.is_admin() then
    raise exception 'only admins can correct scores';
  end if;
  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  if tm.winner_id is null then
    raise exception 'that match has no result to correct';
  end if;
  if p_player1_score = p_player2_score then
    raise exception 'a tournament match cannot end level';
  end if;
  -- The corrected scores must still agree with the recorded winner; changing
  -- who won is a different operation with different consequences.
  if (tm.winner_id = tm.player1_id and p_player1_score < p_player2_score)
     or (tm.winner_id = tm.player2_id and p_player2_score < p_player1_score) then
    raise exception 'those scores contradict the recorded winner — void the result instead';
  end if;

  update tournament_matches
  set player1_score = p_player1_score, player2_score = p_player2_score
  where id = p_tournament_match_id;

  update matches
  set reporter_score = p_player1_score, opponent_score = p_player2_score
  where tournament_match_id = p_tournament_match_id;
end;
$$;

revoke execute on function public.correct_tournament_scores(uuid, int, int) from public, anon;
grant execute on function public.correct_tournament_scores(uuid, int, int) to authenticated;

revoke execute on function public.create_tournament(text, uuid) from public, anon;
revoke execute on function public.set_tournament_entrants(uuid, jsonb) from public, anon;
revoke execute on function public.start_tournament(uuid, jsonb) from public, anon;
revoke execute on function public.record_tournament_result(uuid, uuid, int, int, uuid, date, jsonb, jsonb, jsonb, int) from public, anon;
revoke execute on function public.void_tournament_result(uuid, jsonb, jsonb, jsonb, int) from public, anon;

grant execute on function public.create_tournament(text, uuid) to authenticated;
grant execute on function public.set_tournament_entrants(uuid, jsonb) to authenticated;
grant execute on function public.start_tournament(uuid, jsonb) to authenticated;
grant execute on function public.record_tournament_result(uuid, uuid, int, int, uuid, date, jsonb, jsonb, jsonb, int) to authenticated;
grant execute on function public.void_tournament_result(uuid, jsonb, jsonb, jsonb, int) to authenticated;
