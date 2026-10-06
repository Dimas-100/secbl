// Identity helpers: the "your ball" colour system that stands in for a photo,
// and the time-of-day greeting. Pure; the club clock comes from lib/events.
import { CLUB_TIMEZONE } from "@/lib/events";

export interface Ball {
  number: number;
  color: string;
  stripe: boolean;
  name: string;
}

// The real rack: solids 1–7, the 8, stripes 9–15 in the same colour order.
const SOLID_COLORS: [string, string][] = [
  ["#f2c230", "yellow"],
  ["#1f4fb3", "blue"],
  ["#d6362b", "red"],
  ["#5b2d8e", "purple"],
  ["#ef7d1a", "orange"],
  ["#1d8a46", "green"],
  ["#7a1f2b", "maroon"],
];

export const BALLS: Ball[] = [
  ...SOLID_COLORS.map(([color, name], i) => ({ number: i + 1, color, stripe: false, name })),
  { number: 8, color: "#111111", stripe: false, name: "black" },
  ...SOLID_COLORS.map(([color, name], i) => ({ number: i + 9, color, stripe: true, name: `${name} stripe` })),
];

// A chosen ball, or a stable one derived from the id so a member without a
// pick still gets a consistent colour everywhere.
export function ballFor(chosen: number | null | undefined, id: string): Ball {
  if (chosen && chosen >= 1 && chosen <= 15) return BALLS[chosen - 1];
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return BALLS[hash % 15];
}

// Inline style for an avatar disc: solid fill, or a stripe's white band.
// Text is dark on the light balls (1 yellow, 9 yellow stripe), white elsewhere.
export function ballStyle(ball: Ball): React.CSSProperties {
  const light = ball.number === 1 || ball.number === 9;
  const color = ball.number === 8 ? "#ffffff" : light ? "#1a1a1a" : "#ffffff";
  if (!ball.stripe) return { backgroundColor: ball.color, color };
  return {
    backgroundColor: ball.color,
    backgroundImage: `linear-gradient(to bottom, ${ball.color} 0 22%, #ffffff 22% 78%, ${ball.color} 78% 100%)`,
    color: "#1a1a1a",
  };
}

const hourFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: CLUB_TIMEZONE,
  hour: "numeric",
  hour12: false,
});

export function greetingFor(now: Date, displayName: string): string {
  const hour = Number(hourFormatter.format(now)) % 24;
  const first = displayName.trim().split(/\s+/)[0] || "there";
  if (hour < 5) return `Late night, ${first}`;
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 17) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
}

export const GAME_LABEL: Record<string, string> = {
  "8ball": "8-ball",
  "9ball": "9-ball",
  "10ball": "10-ball",
  other: "Other",
};
