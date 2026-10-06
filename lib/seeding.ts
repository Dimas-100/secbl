// Seed-order helpers for tournament setup. Pure, so the editor's behaviour is
// tested without a browser. The seed list is the bracket: lib/bracket.ts
// seats players by their position in it.

// Tap in order: a player not yet seeded joins as the last seed; a seeded
// player leaves and everyone below moves up one.
export function toggleSeed(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// Fisher–Yates over a copy, with the random source injected for tests.
export function shuffleSeeds(ids: string[], rng: () => number): string[] {
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Strongest first; equal ratings fall back to name so the order is stable.
export function byRating(ids: string[], ratingOf: (id: string) => number, nameOf: (id: string) => string): string[] {
  return [...ids].sort((a, b) => ratingOf(b) - ratingOf(a) || nameOf(a).localeCompare(nameOf(b)) || a.localeCompare(b));
}
