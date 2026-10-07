-- Cup scoreboard: every cup has a race length, so a match has a finish line
-- (rails, "needs 2", auto-finish) and its rated match row carries the format
-- like any other race. Default 5; existing cups get 5 too.

alter table public.tournaments
  add column race_to smallint not null default 5 check (race_to between 1 and 25);

-- create_tournament gains the race length. The two-argument form is dropped
-- so PostgREST never has to choose between overloads.
drop function if exists public.create_tournament(text, uuid);
create or replace function public.create_tournament(p_name text, p_event_id uuid, p_race_to int)
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
  if p_race_to is null or p_race_to < 1 or p_race_to > 25 then
    raise exception 'race length must be between 1 and 25';
  end if;
  insert into tournaments (name, event_id, created_by, race_to)
  values (trim(p_name), p_event_id, auth.uid(), p_race_to)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.create_tournament(text, uuid, int) from public, anon;
grant execute on function public.create_tournament(text, uuid, int) to authenticated;

-- Results must reach the cup's race length, and the rated match row records
-- it. Same body as 0012 otherwise.
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
  v_race smallint;
  v_remaining int;
begin
  if not public.is_admin() then
    raise exception 'only admins can record results';
  end if;
  perform pg_advisory_xact_lock(hashtext('secbl_ratings'));

  if (select count(*) from matches where status = 'confirmed') <> p_expected_confirmed then
    raise exception 'the ladder changed while this result was being prepared — try again';
  end if;

  select * into tm from tournament_matches where id = p_tournament_match_id for update;
  if not found then
    raise exception 'match not found';
  end if;
  select status, race_to into v_status, v_race from tournaments where id = tm.tournament_id for update;
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
  if greatest(p_player1_score, p_player2_score) <> v_race or least(p_player1_score, p_player2_score) >= v_race then
    raise exception 'the winner must reach % — this cup is a race to %', v_race, v_race;
  end if;
  if (p_winner_id = tm.player1_id) <> (p_player1_score > p_player2_score) then
    raise exception 'the winner must have the higher score';
  end if;

  insert into matches (
    id, reporter_id, opponent_id, winner_id,
    reporter_score, opponent_score, game_type, status,
    tournament_match_id, played_at, confirmed_at, race_to
  ) values (
    p_match_id, tm.player1_id, tm.player2_id, p_winner_id,
    p_player1_score, p_player2_score, '8ball', 'confirmed',
    p_tournament_match_id, p_played_at, now(), v_race
  );

  update tournament_matches
  set player1_score = p_player1_score,
      player2_score = p_player2_score,
      winner_id = p_winner_id
  where id = p_tournament_match_id;

  if tm.winner_advances_to is not null then
    if tm.winner_advances_slot = 1 then
      update tournament_matches set player1_id = p_winner_id
        where id = tm.winner_advances_to and tournament_id = tm.tournament_id;
    else
      update tournament_matches set player2_id = p_winner_id
        where id = tm.winner_advances_to and tournament_id = tm.tournament_id;
    end if;
  end if;

  if p_deltas is null
     or (select count(*) from matches where status = 'confirmed') <> jsonb_array_length(p_deltas)
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

-- A corrected score still has to be a finished race.
create or replace function public.correct_tournament_scores(
  p_tournament_match_id uuid,
  p_player1_score int,
  p_player2_score int
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  tm tournament_matches%rowtype;
  v_race smallint;
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
  if tm.player1_id is null or tm.player2_id is null then
    raise exception 'a bye has no score to correct';
  end if;
  if p_player1_score = p_player2_score then
    raise exception 'a tournament match cannot end level';
  end if;
  select race_to into v_race from tournaments where id = tm.tournament_id;
  if greatest(p_player1_score, p_player2_score) <> v_race or least(p_player1_score, p_player2_score) >= v_race then
    raise exception 'the winner must reach % — this cup is a race to %', v_race, v_race;
  end if;
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
