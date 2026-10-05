// Small pure helpers for the "fun" layer on Home: a win/loss form strip and
// the rating points a confirmed match handed its winner.

export interface FormMatch {
  id: string;
  winner_id: string;
}

export function formStrip(matches: FormMatch[], viewerId: string): { id: string; won: boolean }[] {
  return matches.map((m) => ({ id: m.id, won: m.winner_id === viewerId }));
}

export interface DeltaMatch {
  reporter_id: string;
  winner_id: string;
  rating_delta_reporter: number | null;
  rating_delta_opponent: number | null;
}

// The winner's gain, or null before the recompute has stamped deltas.
export function winnerDelta(m: DeltaMatch): number | null {
  const delta = m.winner_id === m.reporter_id ? m.rating_delta_reporter : m.rating_delta_opponent;
  return delta === null || delta === undefined ? null : Math.abs(delta);
}
