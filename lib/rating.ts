// Fargo-style Elo: a 100-point gap means 2:1 expected odds (spec §5).
export const STARTING_RATING = 450;
export const RATING_FLOOR = 100;
export const PROVISIONAL_GAMES = 10;
export const K_PROVISIONAL = 64;
export const K_STANDARD = 32;

export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(2, (ratingB - ratingA) / 100));
}

export function kFactor(matchesPlayed: number): number {
  return matchesPlayed < PROVISIONAL_GAMES ? K_PROVISIONAL : K_STANDARD;
}

export interface RatingUpdate {
  delta: number;
  newRating: number;
}

export function ratingUpdate(
  rating: number,
  opponentRating: number,
  won: boolean,
  matchesPlayed: number
): RatingUpdate {
  const expected = expectedScore(rating, opponentRating);
  const delta = Math.round(kFactor(matchesPlayed) * ((won ? 1 : 0) - expected));
  return { delta, newRating: Math.max(RATING_FLOOR, rating + delta) };
}

export interface ReplayMatch {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  confirmed_at: string;
}

export interface ReplayStanding {
  profile_id: string;
  rating: number;
  matches_played: number;
}

export interface ReplayHistoryRow {
  profile_id: string;
  match_id: string;
  rating_before: number;
  rating_after: number;
  // The match's own confirmation time, not the recompute's. Without this,
  // rebuilt history rows all default to now() and every player's rating
  // history loses its order permanently.
  created_at: string;
}

export interface ReplayDelta {
  match_id: string;
  rating_delta_reporter: number;
  rating_delta_opponent: number;
}

export interface ReplayResult {
  standings: ReplayStanding[];
  history: ReplayHistoryRow[];
  deltas: ReplayDelta[];
}

// Rebuilds the whole ladder from confirmed match history.
//
// Rating is path-dependent — K falls after a player's 10th match, and the
// expected score depends on both ratings at that moment — so a correction
// cannot be applied by subtracting old deltas and adding new ones. Replaying
// is both exact and simpler. `matches` must already be ordered by
// (confirmed_at, id) for the result to be reproducible.
export function replayRatings(
  matches: ReplayMatch[],
  playerIds: string[]
): ReplayResult {
  const standings = new Map<string, ReplayStanding>();
  const ensure = (id: string): ReplayStanding => {
    let standing = standings.get(id);
    if (!standing) {
      standing = { profile_id: id, rating: STARTING_RATING, matches_played: 0 };
      standings.set(id, standing);
    }
    return standing;
  };
  for (const id of playerIds) ensure(id);

  const history: ReplayHistoryRow[] = [];
  const deltas: ReplayDelta[] = [];

  for (const match of matches) {
    const reporter = ensure(match.reporter_id);
    const opponent = ensure(match.opponent_id);
    const reporterWon = match.winner_id === match.reporter_id;

    // Both sides are computed from the pre-match snapshot, so the result does
    // not depend on which player is updated first.
    const reporterBefore = reporter.rating;
    const opponentBefore = opponent.rating;
    const reporterResult = ratingUpdate(
      reporterBefore,
      opponentBefore,
      reporterWon,
      reporter.matches_played
    );
    const opponentResult = ratingUpdate(
      opponentBefore,
      reporterBefore,
      !reporterWon,
      opponent.matches_played
    );

    reporter.rating = reporterResult.newRating;
    opponent.rating = opponentResult.newRating;
    reporter.matches_played += 1;
    opponent.matches_played += 1;

    history.push(
      {
        profile_id: reporter.profile_id,
        match_id: match.id,
        rating_before: reporterBefore,
        rating_after: reporterResult.newRating,
        created_at: match.confirmed_at,
      },
      {
        profile_id: opponent.profile_id,
        match_id: match.id,
        rating_before: opponentBefore,
        rating_after: opponentResult.newRating,
        created_at: match.confirmed_at,
      }
    );
    deltas.push({
      match_id: match.id,
      rating_delta_reporter: reporterResult.newRating - reporterBefore,
      rating_delta_opponent: opponentResult.newRating - opponentBefore,
    });
  }

  return { standings: [...standings.values()], history, deltas };
}
