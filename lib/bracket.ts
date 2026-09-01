// Single-elimination bracket generation and advancement. Pure functions over
// plain data so the fiddly parts — bye placement, advance wiring — are tested
// without a database.

export interface GeneratedMatch {
  id: string;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  winner_id: string | null;
  winner_advances_to: string | null;
  winner_advances_slot: 1 | 2 | null;
}

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 32;

export function bracketSize(playerCount: number): number {
  let size = 2;
  while (size < playerCount) size *= 2;
  return size;
}

// Standard bracket order: seed s meets seed size+1-s. Built by repeatedly
// mirroring, which is what makes 1 and 2 meet only in the final.
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next: number[] = [];
    const mirror = order.length * 2 + 1;
    for (const seed of order) next.push(seed, mirror - seed);
    order = next;
  }
  return order;
}

export function generateSingleElim(
  playerIds: string[],
  newId: () => string
): GeneratedMatch[] {
  const n = playerIds.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new Error(`a tournament needs ${MIN_PLAYERS}-${MAX_PLAYERS} players, got ${n}`);
  }
  const size = bracketSize(n);
  const rounds = Math.log2(size);

  // Build every round's empty matches first, so advance links can point at
  // rows that already have ids.
  const matches: GeneratedMatch[] = [];
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      matches.push({
        id: newId(),
        round,
        position,
        player1_id: null,
        player2_id: null,
        winner_id: null,
        winner_advances_to: null,
        winner_advances_slot: null,
      });
    }
  }
  const at = (round: number, position: number) =>
    matches.find((m) => m.round === round && m.position === position)!;

  // Wire each match into the next round. Positions 0,1 feed slots 1,2 of the
  // parent at position 0; 2,3 feed position 1; and so on.
  for (let round = 1; round < rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 0; position < count; position++) {
      const match = at(round, position);
      match.winner_advances_to = at(round + 1, Math.floor(position / 2)).id;
      match.winner_advances_slot = position % 2 === 0 ? 1 : 2;
    }
  }

  // Seat round one by standard seeding. A seed above the field size is an
  // empty slot, which is exactly where the byes land — the top B-n seeds.
  const order = seedOrder(size);
  const seatOf = (seed: number) => (seed <= n ? playerIds[seed - 1] : null);
  for (let position = 0; position < size / 2; position++) {
    const match = at(1, position);
    match.player1_id = seatOf(order[position * 2]);
    match.player2_id = seatOf(order[position * 2 + 1]);
  }

  // Resolve byes now: a round-one match with one player has nobody to play.
  // Byes cannot reach round two on both sides of a match, because the field is
  // always more than half the bracket, so no cascade beyond this pass exists.
  for (const match of matches.filter((m) => m.round === 1)) {
    const solo =
      match.player1_id !== null && match.player2_id === null
        ? match.player1_id
        : match.player2_id !== null && match.player1_id === null
          ? match.player2_id
          : null;
    if (solo === null) continue;
    match.winner_id = solo;
    const target = matches.find((m) => m.id === match.winner_advances_to);
    if (target) {
      if (match.winner_advances_slot === 1) target.player1_id = solo;
      else target.player2_id = solo;
    }
  }

  return matches;
}

export function advanceWinner(
  matches: GeneratedMatch[],
  matchId: string,
  winnerId: string
): GeneratedMatch[] {
  const source = matches.find((m) => m.id === matchId);
  if (!source) throw new Error(`match ${matchId} not in this bracket`);
  if (winnerId !== source.player1_id && winnerId !== source.player2_id) {
    throw new Error("winner must be one of the two players in the match");
  }
  return matches.map((m) => {
    if (m.id === source.id) return { ...m, winner_id: winnerId };
    if (m.id !== source.winner_advances_to) return m;
    return source.winner_advances_slot === 1
      ? { ...m, player1_id: winnerId }
      : { ...m, player2_id: winnerId };
  });
}

export function bracketRounds(matches: GeneratedMatch[]): GeneratedMatch[][] {
  const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((round) =>
    matches.filter((m) => m.round === round).sort((a, b) => a.position - b.position)
  );
}
