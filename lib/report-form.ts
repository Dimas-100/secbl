// Pure logic for the one-screen report form, kept out of the component so
// vitest covers it without DOM tooling.

export function recentOpponents<T extends { id: string; display_name: string }>(
  matchOpponentIds: string[],
  all: T[],
  n = 3
): T[] {
  const byId = new Map(all.map((o) => [o.id, o]));
  const picked: T[] = [];
  const seen = new Set<string>();
  for (const id of matchOpponentIds) {
    const o = byId.get(id);
    if (o && !seen.has(id)) {
      picked.push(o);
      seen.add(id);
      if (picked.length === n) return picked;
    }
  }
  const fill = [...all]
    .sort((a, b) => a.display_name.localeCompare(b.display_name))
    .filter((o) => !seen.has(o.id));
  return [...picked, ...fill.slice(0, n - picked.length)];
}

export function stepScore(current: number, delta: 1 | -1): number {
  return Math.min(99, Math.max(0, current + delta));
}

export function submitState(
  you: number,
  them: number,
  opponentName: string | null
): { label: string; disabled: boolean; reason: string | null } {
  if (!opponentName)
    return { label: "Report match", disabled: true, reason: "Pick your opponent" };
  if (you === 0 && them === 0)
    return { label: "Report match", disabled: true, reason: "Enter the score" };
  if (you === them)
    return { label: "Report match", disabled: true, reason: "Scores can't be equal" };
  const outcome = you > them ? "win" : "loss";
  // U+2013 en dash between scores, matching how scores render app-wide.
  return { label: `Report ${you}–${them} ${outcome}`, disabled: false, reason: null };
}
