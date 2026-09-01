-- Follow-up integrity constraints, in the spirit of 0002b_match_integrity:
-- the database, not just the server action, rejects impossible bracket rows.

-- (a) An advance link is a pair. The bracket is inserted in two passes -- rows
-- first with both null, then links wired -- and both of those states satisfy
-- this. What it rejects is a half-wired link from a generator bug: a target
-- with no slot silently drops the winner, a slot with no target is a no-op.
alter table public.tournament_matches
  add constraint tournament_matches_winner_link_paired
  check ((winner_advances_to is null) = (winner_advances_slot is null));

alter table public.tournament_matches
  add constraint tournament_matches_loser_link_paired
  check ((loser_advances_to is null) = (loser_advances_slot is null));

-- (b) Nobody plays themselves. Mirrors matches' own
-- `check (reporter_id <> opponent_id)`. Nullable-safe on purpose: a bye is a
-- legitimate row with player2_id null.
alter table public.tournament_matches
  add constraint tournament_matches_distinct_players
  check (player1_id is null or player2_id is null or player1_id <> player2_id);

-- (c) matches.tournament_match_id predates tournament_matches existing, so it
-- was never a real foreign key. Deleting a tournament cascades its bracket and
-- would leave RATED matches pointing at nothing.
--
-- SET NULL, deliberately not CASCADE: the match was genuinely played and its
-- rating is part of the ladder. Losing the tournament record must not delete
-- results or the ladder silently changes.
alter table public.matches
  add constraint matches_tournament_match_id_fkey
  foreign key (tournament_match_id) references public.tournament_matches(id)
  on delete set null;
