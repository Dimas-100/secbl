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
