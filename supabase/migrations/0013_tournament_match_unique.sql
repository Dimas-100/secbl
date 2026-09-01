-- One rated match per tournament match, enforced rather than assumed.
--
-- Two places already rely on this being true without anything guaranteeing it:
-- voidResult reads the rated match with .maybeSingle(), which THROWS if a
-- second row ever appeared, and correct_tournament_scores updates
-- `where tournament_match_id = ...` unqualified, which would silently rewrite
-- both. The invariant holds today only because record_tournament_result
-- refuses a match that already has a winner.
--
-- A unique index also gives matches.tournament_match_id the index it has never
-- had, so the ON DELETE SET NULL added in 0010b stops sequentially scanning
-- `matches` once per deleted bracket row.
--
-- Partial, because tournament_match_id is null for every ordinary reported
-- match and those must stay unconstrained.
create unique index if not exists matches_tournament_match_id_key
  on public.matches (tournament_match_id)
  where tournament_match_id is not null;
