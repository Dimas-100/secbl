// Seed-order helpers for tournament setup. Pure, so the editor's buttons are
// tested without a browser. The seed list is the bracket: lib/bracket.ts
// seats players by their position in it.

// Swap the seed at `index` with its neighbour in `dir` (-1 up, +1 down).
export function moveSeed(ids: string[], index: number, dir: -1 | 1): string[] {
  const target = index + dir;
  if (index < 0 || index >= ids.length || target < 0 || target >= ids.length) return [...ids];
  const out = [...ids];
  [out[index], out[target]] = [out[target], out[index]];
  return out;
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
