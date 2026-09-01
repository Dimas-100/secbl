import { describe, expect, it } from "vitest";
import {
  advanceWinner,
  bracketRounds,
  bracketSize,
  generateSingleElim,
  type GeneratedMatch,
} from "@/lib/bracket";

// Deterministic ids so assertions are readable.
function idFactory() {
  let n = 0;
  return () => `m${n++}`;
}
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("bracketSize", () => {
  it("is the next power of two at or above the field", () => {
    expect(bracketSize(3)).toBe(4);
    expect(bracketSize(4)).toBe(4);
    expect(bracketSize(5)).toBe(8);
    expect(bracketSize(16)).toBe(16);
    expect(bracketSize(17)).toBe(32);
    expect(bracketSize(32)).toBe(32);
  });
});

describe("seedOrder", () => {
  it("pairs seed s against seed size+1-s", async () => {
    const { seedOrder } = await import("@/lib/bracket");
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it("puts every seed in exactly once", async () => {
    const { seedOrder } = await import("@/lib/bracket");
    const order = seedOrder(32);
    expect(new Set(order).size).toBe(32);
    expect(Math.min(...order)).toBe(1);
    expect(Math.max(...order)).toBe(32);
  });
});

describe("generateSingleElim", () => {
  it("builds a full tree for a power-of-two field", () => {
    const matches = generateSingleElim(players(4), idFactory());
    // 4 players -> 2 first-round matches + 1 final.
    expect(matches).toHaveLength(3);
    const r1 = matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2);
    // Standard seeding: 1v4 and 2v3.
    expect([r1[0].player1_id, r1[0].player2_id]).toEqual(["p1", "p4"]);
    expect([r1[1].player1_id, r1[1].player2_id]).toEqual(["p2", "p3"]);
  });

  it("wires every non-final match into the next round", () => {
    const matches = generateSingleElim(players(8), idFactory());
    const byId = new Map(matches.map((m) => [m.id, m]));
    const finals = matches.filter((m) => m.winner_advances_to === null);
    expect(finals).toHaveLength(1);
    for (const m of matches.filter((x) => x.winner_advances_to !== null)) {
      const target = byId.get(m.winner_advances_to!)!;
      expect(target.round).toBe(m.round + 1);
      expect(m.winner_advances_slot === 1 || m.winner_advances_slot === 2).toBe(true);
    }
  });

  it("gives byes to the top seeds and resolves them immediately", () => {
    // 5 players in a bracket of 8 -> 3 byes, for seeds 1, 2 and 3.
    const matches = generateSingleElim(players(5), idFactory());
    const r1 = matches.filter((m) => m.round === 1);
    const byes = r1.filter((m) => m.player1_id !== null && m.player2_id === null);
    expect(byes.map((m) => m.player1_id).sort()).toEqual(["p1", "p2", "p3"]);
    // A bye is already decided, and its winner is standing in round two.
    for (const bye of byes) {
      expect(bye.winner_id).toBe(bye.player1_id);
      const target = matches.find((m) => m.id === bye.winner_advances_to)!;
      const slot = bye.winner_advances_slot === 1 ? target.player1_id : target.player2_id;
      expect(slot).toBe(bye.player1_id);
    }
  });

  it("never marks a contested match as already won", () => {
    const matches = generateSingleElim(players(5), idFactory());
    const contested = matches.filter(
      (m) => m.player1_id !== null && m.player2_id !== null
    );
    for (const m of contested) expect(m.winner_id).toBeNull();
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 12, 15, 16, 17, 24, 31, 32])(
    "produces a consistent tree for %i players",
    (n) => {
      const matches = generateSingleElim(players(n), idFactory());
      const size = bracketSize(n);
      // A single-elim bracket of size B always has B-1 matches.
      expect(matches).toHaveLength(size - 1);
      // Every entrant appears exactly once in round one.
      const placed = matches
        .filter((m) => m.round === 1)
        .flatMap((m) => [m.player1_id, m.player2_id])
        .filter((x): x is string => x !== null);
      expect(placed.sort()).toEqual(players(n).sort());
      // Byes only ever occur in round one.
      const laterEmpty = matches.filter(
        (m) => m.round > 1 && m.player1_id !== null && m.player2_id === null && m.winner_id !== null
      );
      expect(laterEmpty).toHaveLength(0);
      // Exactly one final, and the tree is connected.
      expect(matches.filter((m) => m.winner_advances_to === null)).toHaveLength(1);
    }
  );

  it.each([8, 16, 32])(
    "keeps the top four seeds in the halves standard seeding requires (%i players)",
    (size) => {
      const matches = generateSingleElim(players(size), idFactory());
      const roundOne = matches
        .filter((m) => m.round === 1)
        .sort((a, b) => a.position - b.position);
      // Which half of the draw a seed sits in: the first half of the round-one
      // matches feed one semi-final, the second half feed the other.
      const half = (seed: number) => {
        const id = `p${seed}`;
        const index = roundOne.findIndex(
          (m) => m.player1_id === id || m.player2_id === id
        );
        return index < roundOne.length / 2 ? 0 : 1;
      };
      // The whole point of seeding: 1 and 2 cannot meet before the final.
      expect(half(1)).not.toBe(half(2));
      // And 4 is drawn into 1's half, 3 into 2's, so the semis are 1v4 and 2v3.
      expect(half(4)).toBe(half(1));
      expect(half(3)).toBe(half(2));
    }
  );

  it("rejects a field smaller than three", () => {
    expect(() => generateSingleElim(players(2), idFactory())).toThrow();
  });
});

describe("advanceWinner", () => {
  it("places the winner in the target slot", () => {
    const matches = generateSingleElim(players(4), idFactory());
    const first = matches.find((m) => m.round === 1 && m.position === 0)!;
    const updated = advanceWinner(matches, first.id, "p1");
    const target = updated.find((m) => m.id === first.winner_advances_to)!;
    const slot = first.winner_advances_slot === 1 ? target.player1_id : target.player2_id;
    expect(slot).toBe("p1");
    expect(updated.find((m) => m.id === first.id)!.winner_id).toBe("p1");
  });

  it("does not mutate the input", () => {
    const matches = generateSingleElim(players(4), idFactory());
    const snapshot = JSON.stringify(matches);
    advanceWinner(matches, matches[0].id, matches[0].player1_id!);
    expect(JSON.stringify(matches)).toBe(snapshot);
  });

  it("refuses a winner who is not in the match", () => {
    const matches = generateSingleElim(players(4), idFactory());
    expect(() => advanceWinner(matches, matches[0].id, "p3")).toThrow();
  });
});

describe("bracketRounds", () => {
  it("groups by round in order, each sorted by position", () => {
    const matches = generateSingleElim(players(8), idFactory());
    const rounds = bracketRounds(matches);
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    for (const round of rounds) {
      const positions = round.map((m) => m.position);
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
    }
  });
});
