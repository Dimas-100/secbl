// The SECBL mark ("Unlit", chosen 2026-10-22): a rack of six touching balls,
// the bottom row and the left middle ball lit in brass, the top and right
// middle still dark: a rack lighting up as you play. One drawing for the
// in-app mark (components/rack-mark.tsx) and every rendered icon
// (scripts/render-icons.mjs), so they can never drift apart. Plain
// TypeScript with no imports: the script loads it straight from Node.

export const RACK_R = 10;

// Centres on a 100-unit square: touching balls 21 apart, rows 18.2 apart,
// the rack centred on the square.
export const RACK_BALLS: readonly { cx: number; cy: number; lit: boolean }[] = [
  { cx: 50, cy: 31.8, lit: false },
  { cx: 39.5, cy: 50, lit: true },
  { cx: 60.5, cy: 50, lit: false },
  { cx: 29, cy: 68.2, lit: true },
  { cx: 50, cy: 68.2, lit: true },
  { cx: 71, cy: 68.2, lit: true },
];

// Graphite tile, brass (--brass at its middle stop) and the unlit balls.
const TILE = ["#25282D", "#0E0F11"];
const LIT = ["#EAD3A2", "#C9A96E", "#8E7240"];
// Light enough that the full triangle still reads on the near-black ground.
const UNLIT = ["#4B4F57", "#2B2E34"];

export interface RackSvgOptions {
  // "rounded": the app tile with its own corners (favicon, the "any" icons);
  // "square": full bleed, for icons the phone crops to its own shape;
  // "none": the bare rack (the lockup, the notification badge).
  tile: "rounded" | "square" | "none";
  // The rack's size inside the square, around its centre: under 1 keeps it
  // in the circle a maskable icon may be cropped to.
  scale?: number;
  // One flat colour for every ball (the monochrome notification badge).
  mono?: string;
  // With tile "none": crop to the rack itself (a square around it), so a
  // bare mark sits flush beside text or fills a badge edge to edge.
  fit?: boolean;
  // Pixel width and height; left out, the SVG fills its box.
  size?: number;
}

export function rackSvg({ tile, scale = 1, mono, fit = false, size }: RackSvgOptions): string {
  const dims = size ? ` width="${size}" height="${size}"` : "";
  // The rack spans x 19–81 and y 21.8–78.2: a 62-unit square around it.
  const box = fit && tile === "none" ? "19 19 62 62" : "0 0 100 100";
  const shade = (id: string, stops: string[]) =>
    `<radialGradient id="${id}" cx="0.35" cy="0.3" r="0.8">` +
    stops.map((c, i) => `<stop offset="${i / (stops.length - 1)}" stop-color="${c}"/>`).join("") +
    `</radialGradient>`;
  const defs = [
    tile !== "none"
      ? `<linearGradient id="secbl-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${TILE[0]}"/><stop offset="1" stop-color="${TILE[1]}"/></linearGradient>`
      : "",
    mono ? "" : shade("secbl-lit", LIT) + shade("secbl-unlit", UNLIT),
  ].join("");
  const ground =
    tile === "rounded"
      ? `<rect width="100" height="100" rx="22" fill="url(#secbl-tile)"/>`
      : tile === "square"
        ? `<rect width="100" height="100" fill="url(#secbl-tile)"/>`
        : "";
  const balls = RACK_BALLS.map(
    (b) => `<circle cx="${b.cx}" cy="${b.cy}" r="${RACK_R}" fill="${mono ?? `url(#secbl-${b.lit ? "lit" : "unlit"})`}"/>`
  ).join("");
  const rack = scale === 1 ? balls : `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${balls}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}"${dims}>${defs ? `<defs>${defs}</defs>` : ""}${ground}${rack}</svg>`;
}
