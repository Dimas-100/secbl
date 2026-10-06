// Pure logic for the one-screen report form, kept out of the component so
// vitest covers it without DOM tooling.

export function recentOpponents<T extends { id: string; display_name: string }>(
  matchOpponentIds: string[],
  all: T[],
  n = 4
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
    return { label: "Send to confirm", disabled: true, reason: "Pick your opponent" };
  if (you === 0 && them === 0)
    return { label: "Send to confirm", disabled: true, reason: "Enter the score" };
  if (you === them)
    return { label: "Send to confirm", disabled: true, reason: "Scores can't be equal" };
  return { label: `Send to ${opponentName} to confirm`, disabled: false, reason: null };
}

// The line under the scores. U+2013 en dash between scores, matching how
// scores render app-wide.
export function resultLine(
  you: number,
  them: number
): { text: string; tone: "win" | "loss" | "muted" } {
  if (you === 0 && them === 0) return { text: "Enter the score", tone: "muted" };
  if (you === them) return { text: "Scores can't be equal", tone: "muted" };
  return you > them
    ? { text: `Win ${you}–${them}`, tone: "win" }
    : { text: `Loss ${you}–${them}`, tone: "loss" };
}
