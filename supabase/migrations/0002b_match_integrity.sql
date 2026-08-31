-- Close bypass-write gaps: the DB, not just the server action, must reject
-- tied scores and a winner_id inconsistent with the scores.
alter table public.matches
  add constraint matches_no_ties check (reporter_score <> opponent_score);

alter table public.matches
  add constraint matches_winner_consistent check (
    (winner_id = reporter_id and reporter_score > opponent_score)
    or (winner_id = opponent_id and opponent_score > reporter_score)
  );
