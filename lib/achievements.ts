// Achievements are computed from what actually happened — nothing is stored,
// so they can never drift from the ladder. Catalogue order is display order.
import { longestWinStreak, opponentOf, type StatMatch } from "@/lib/stats";

export interface Achievement {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export interface AchievementInput {
  viewerId: string;
  rating: number;
  peak: number;
  // Newest first, confirmed only.
  matches: StatMatch[];
  // Opponents' current ratings, for "giant killer".
  opponentRatings: Record<string, number>;
  tournamentsWon: number;
}

const CATALOGUE: (Achievement & { test: (i: AchievementInput) => boolean })[] = [
  {
    id: "first-win",
    label: "First win",
    emoji: "🎱",
    description: "Won a confirmed match.",
    test: (i) => i.matches.some((m) => m.winner_id === i.viewerId),
  },
  {
    id: "regular",
    label: "Regular",
    emoji: "📅",
    description: "Ten confirmed matches.",
    test: (i) => i.matches.length >= 10,
  },
  {
    id: "veteran",
    label: "Veteran",
    emoji: "🏛️",
    description: "Twenty-five confirmed matches.",
    test: (i) => i.matches.length >= 25,
  },
  {
    id: "heater",
    label: "Heater",
    emoji: "🔥",
    description: "Five wins in a row.",
    test: (i) => longestWinStreak(i.matches, i.viewerId) >= 5,
  },
  {
    id: "shutout",
    label: "Shutout",
    emoji: "🧹",
    description: "Won a race without dropping a game.",
    test: (i) =>
      i.matches.some((m) => {
        if (m.winner_id !== i.viewerId) return false;
        const theirs = m.reporter_id === i.viewerId ? m.opponent_score : m.reporter_score;
        return theirs === 0;
      }),
  },
  {
    id: "giant-killer",
    label: "Giant killer",
    emoji: "🗡️",
    description: "Beat a player rated 50+ above you.",
    test: (i) =>
      i.matches.some(
        (m) => m.winner_id === i.viewerId && (i.opponentRatings[opponentOf(m, i.viewerId)] ?? 0) >= i.rating + 50
      ),
  },
  {
    id: "five-hundred",
    label: "500 club",
    emoji: "📈",
    description: "Reached a 500 rating.",
    test: (i) => i.peak >= 500,
  },
  {
    id: "six-hundred",
    label: "600 club",
    emoji: "🚀",
    description: "Reached a 600 rating.",
    test: (i) => i.peak >= 600,
  },
  {
    id: "champion",
    label: "Champion",
    emoji: "🏆",
    description: "Won a tournament.",
    test: (i) => i.tournamentsWon >= 1,
  },
];

function strip(a: (typeof CATALOGUE)[number]): Achievement {
  return { id: a.id, label: a.label, emoji: a.emoji, description: a.description };
}

export const ACHIEVEMENTS: Achievement[] = CATALOGUE.map(strip);

export function earnedAchievements(input: AchievementInput): Achievement[] {
  return CATALOGUE.filter((a) => a.test(input)).map(strip);
}
