import type { ReactNode } from "react";

// The costume rack (lib/character.ts COSTUMES), drawn in the same 120×200
// space as components/character.tsx. A costume dresses the whole figure:
// its own torso, sleeves and trousers, and any of headwear (replacing the
// member's hat), a hood (which hides hair and ears, like the headscarf), a
// layer behind the body (a cape) and something over the eyes (a mask, a
// patch). `c` is the member's outfit colour, for the costumes that take one.

export interface CostumeArt {
  sleeve: (c: string) => string;
  pants: (c: string) => string;
  // Gloves, where the costume has them; bare hands otherwise.
  hands?: string;
  hood?: string;
  torso: (c: string) => ReactNode;
  back?: (c: string) => ReactNode;
  head?: (c: string) => ReactNode;
  face?: ReactNode;
}

const BRASS = "#C9A96E";
const GOLD = "#FFDE59";
const WHITE = "#F3F1EC";
const SHADE = "rgba(0,0,0,0.2)";
const INK = "#141414";

const Body = ({ fill }: { fill: string }) => <rect x="39" y="74" width="42" height="60" rx="10" fill={fill} />;

// A four-point sparkle.
function star(cx: number, cy: number, r: number) {
  const k = r * 0.3;
  return `M${cx} ${cy - r} L${cx + k} ${cy - k} L${cx + r} ${cy} L${cx + k} ${cy + k} L${cx} ${cy + r} L${cx - k} ${cy + k} L${cx - r} ${cy} L${cx - k} ${cy - k}Z`;
}

const VEST =
  "M39 84 Q39 74 49 74 L55 74 L60 104 L60 134 L47 134 Q39 134 39 126Z M81 84 Q81 74 71 74 L65 74 L60 104 L60 134 L73 134 Q81 134 81 126Z";
const OPEN_VEST =
  "M39 84 Q39 74 49 74 L53 74 L53 134 L47 134 Q39 134 39 126Z M81 84 Q81 74 71 74 L67 74 L67 134 L73 134 Q81 134 81 126Z";
const BOW = "M60 78 L52 74 L52 82Z M60 78 L68 74 L68 82Z";

export const COSTUME_ART: Record<string, CostumeArt> = {
  // A billiards referee: white gloves, black waistcoat, bow tie.
  referee: {
    sleeve: () => WHITE,
    pants: () => "#16171A",
    hands: "#F8F8F6",
    torso: () => (
      <>
        <Body fill={WHITE} />
        <path d="M52.5 73 L60 79.5 L56 83.5Z M67.5 73 L60 79.5 L64 83.5Z" fill="#ffffff" stroke={SHADE} strokeWidth="0.7" />
        <path d={VEST} fill="#16171A" />
        <circle cx="60" cy="112" r="1.4" fill="#5B6470" />
        <circle cx="60" cy="122" r="1.4" fill="#5B6470" />
        <path d={BOW} fill="#0B0B0C" />
        <circle cx="60" cy="78" r="1.6" fill="#0B0B0C" />
        <rect x="70" y="90" width="7" height="2.4" rx="0.8" fill={BRASS} />
      </>
    ),
  },

  astronaut: {
    sleeve: () => "#E6E9EE",
    pants: () => "#E6E9EE",
    hands: "#F3F4F6",
    torso: () => (
      <>
        <Body fill="#E6E9EE" />
        <ellipse cx="60" cy="75" rx="14" ry="4.5" fill="#AEB6C0" />
        <rect x="52" y="88" width="16" height="12" rx="2" fill="#3A4250" />
        <circle cx="56" cy="92" r="1.4" fill="#E05A4A" />
        <circle cx="60" cy="92" r="1.4" fill={GOLD} />
        <circle cx="64" cy="92" r="1.4" fill="#4FA3F7" />
        <rect x="55" y="95.5" width="10" height="2" rx="1" fill="#8FCBAA" />
        <rect x="42.5" y="84" width="6" height="4" rx="0.8" fill="#2E5BB8" />
        <rect x="39" y="118" width="42" height="4" fill="#AEB6C0" />
      </>
    ),
    head: () => (
      <>
        <circle cx="60" cy="49" r="27.5" fill="#CFE8FF" fillOpacity="0.16" stroke="#E6E9EE" strokeWidth="3" />
        <path d="M40 36 Q45 27 55 24" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <circle cx="78.5" cy="61" r="1.6" fill="#ffffff" opacity="0.5" />
      </>
    ),
  },

  superhero: {
    sleeve: (c) => c,
    pants: (c) => c,
    torso: (c) => (
      <>
        <Body fill={c} />
        <circle cx="60" cy="92" r="6.5" fill={GOLD} />
        <circle cx="60" cy="92" r="4.4" fill={INK} />
        <circle cx="60" cy="92" r="2" fill="#ffffff" />
        <rect x="39" y="118" width="42" height="5" fill={GOLD} />
        <rect x="57" y="117.5" width="6" height="6" rx="1" fill="#C98A1A" />
      </>
    ),
    back: () => (
      <>
        <path d="M41 76 Q35 120 28 180 Q60 186 92 180 Q85 120 79 76Z" fill="#B8322A" />
        <path d="M60 80 Q58 130 60 184" stroke="#000000" strokeOpacity="0.15" strokeWidth="6" fill="none" />
      </>
    ),
    face: (
      <path
        fillRule="evenodd"
        d="M39.5 46.5 Q60 41 80.5 46.5 L80.5 55.5 Q60 51.5 39.5 55.5Z M48.6 51 a4.4 3.9 0 1 0 8.8 0 a4.4 3.9 0 1 0 -8.8 0Z M62.6 51 a4.4 3.9 0 1 0 8.8 0 a4.4 3.9 0 1 0 -8.8 0Z"
        fill="#1A1F2E"
      />
    ),
  },

  wizard: {
    sleeve: (c) => c,
    pants: (c) => c,
    torso: (c) => (
      <>
        <Body fill={c} />
        <path d="M50 73 Q60 82 70 73" stroke="#ffffff" strokeOpacity="0.25" strokeWidth="2" fill="none" />
        <line x1="60" y1="80" x2="60" y2="134" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1" />
        {(
          [
            [47, 92, 2.6],
            [72, 104, 2.2],
            [50, 121, 2],
            [70, 84, 1.8],
            [66, 125, 2.4],
          ] as const
        ).map(([x, y, r]) => (
          <path key={`${x}-${y}`} d={star(x, y, r)} fill={GOLD} />
        ))}
        <path d="M41 112 Q60 116 79 112" stroke={BRASS} strokeWidth="2.2" fill="none" />
        <path d="M66 115 L67 124" stroke={BRASS} strokeWidth="1.6" strokeLinecap="round" />
      </>
    ),
    head: (c) => (
      <>
        <ellipse cx="60" cy="35.5" rx="27" ry="5.5" fill={c} />
        <ellipse cx="60" cy="35.5" rx="27" ry="5.5" fill={SHADE} />
        <path d="M43 35 Q50 24 55 10 Q59 -2 71 -6 Q63 6 66 16 Q70 26 77 35Z" fill={c} />
        <path d="M49 30 Q53 22 56 13" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <path d="M44.5 31 Q60 35 75.5 31 L76.5 35 Q60 39 43.5 35Z" fill={GOLD} />
        <path d={star(59, 18, 2.6)} fill={GOLD} />
        <path d={star(67, 26, 2)} fill={GOLD} />
      </>
    ),
  },

  pirate: {
    sleeve: () => WHITE,
    pants: () => "#3A2A1E",
    torso: () => (
      <>
        <Body fill={WHITE} />
        {[78, 86, 94, 102, 110, 118, 126].map((y) => (
          <rect key={y} x="40" y={y} width="40" height="3.5" fill="#1F2A44" />
        ))}
        <path d={OPEN_VEST} fill="#5A3A22" />
        <rect x="39" y="120" width="42" height="6" fill="#B8322A" />
      </>
    ),
    head: () => (
      <>
        <path d="M38 45 C37 28 49 23 61 23 C73 23 83 29 82 44 Q60 37 38 45Z" fill="#B8322A" />
        {(
          [
            [48, 32],
            [58, 28],
            [68, 30],
            [75, 38],
            [53, 39],
            [64, 37],
          ] as const
        ).map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="#ffffff" opacity="0.85" />
        ))}
        <path d="M81 41 L91 45 L87 50Z M81 43 L87 53 L82 53Z" fill="#B8322A" />
      </>
    ),
    face: (
      <>
        <path d="M40.5 43.5 L63.5 49 M70.5 49.5 L81.5 47" stroke={INK} strokeWidth="1.3" />
        <ellipse cx="67" cy="51.3" rx="4" ry="3.8" fill={INK} />
      </>
    ),
  },

  cowboy: {
    sleeve: () => "#A8322A",
    pants: () => "#3D5A80",
    torso: () => (
      <>
        <Body fill="#A8322A" />
        {[45, 51, 57, 63, 69, 75].map((x) => (
          <line key={x} x1={x} y1="76" x2={x} y2="133" stroke="#000000" strokeOpacity="0.25" strokeWidth="1.5" />
        ))}
        {[82, 92, 102, 112, 122].map((y) => (
          <line key={y} x1="40" y1={y} x2="80" y2={y} stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1.2" />
        ))}
        <path d={VEST} fill="#6B4423" />
        <path d="M52 73.5 L68 73.5 L60 84Z" fill="#2E5BB8" />
        <circle cx="45" cy="96" r="1.1" fill={BRASS} />
      </>
    ),
    head: () => (
      <>
        <path d="M45 37 C44 24 49 17 54 18.5 Q60 22 66 18.5 C71 17 76 24 75 37Z" fill="#B08850" />
        <rect x="45" y="31" width="30" height="3.5" fill="#4A3220" />
        <path d="M27 35 Q29 43 41 41 Q60 44 79 41 Q91 43 93 35 Q87 39.5 79 37.5 Q60 34 41 37.5 Q33 39.5 27 35Z" fill="#9A7442" />
        <path d="M50 29 Q51 22 54 20" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </>
    ),
  },

  chef: {
    sleeve: () => "#F7F7F4",
    pants: () => "#3A3F46",
    torso: () => (
      <>
        <Body fill="#F7F7F4" />
        <line x1="66" y1="76" x2="66" y2="134" stroke={SHADE} strokeWidth="0.8" />
        {[86, 96, 106, 116].map((y) => (
          <g key={y}>
            <circle cx="54" cy={y} r="1.2" fill="#B8BDC4" />
            <circle cx="66" cy={y} r="1.2" fill="#B8BDC4" />
          </g>
        ))}
        <path d="M52 73.5 L68 73.5 L60 82Z" fill="#B8322A" />
      </>
    ),
    head: () => (
      <>
        <rect x="42" y="22" width="36" height="12" fill="#FBFBF8" />
        <circle cx="46" cy="24" r="9" fill="#FBFBF8" />
        <circle cx="60" cy="18" r="11.5" fill="#FBFBF8" />
        <circle cx="74" cy="24" r="9" fill="#FBFBF8" />
        <path d="M50 30 L49 22 M60 30 L60 20 M70 30 L71 22" stroke="#000000" strokeOpacity="0.1" strokeWidth="1.2" />
        <rect x="41" y="31" width="38" height="9" rx="3" fill="#F3F3EF" />
        <line x1="42" y1="36" x2="78" y2="36" stroke="#000000" strokeOpacity="0.08" strokeWidth="1.2" />
      </>
    ),
  },

  graduate: {
    sleeve: () => "#141518",
    pants: () => "#141518",
    torso: () => (
      <>
        <Body fill="#141518" />
        <path d="M55 74 L60 79 L65 74" fill="#ffffff" />
        <path d="M52.5 74 L51 134 M67.5 74 L69 134" stroke={BRASS} strokeWidth="4.5" />
        <path d="M56 84 L56 134 M64 84 L64 134" stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1.5" />
      </>
    ),
    head: () => (
      <>
        <path d="M43 38 Q44 30 60 29.5 Q76 30 77 38 Q60 34 43 38Z" fill="#141518" />
        <path d="M33 30.5 L60 21.5 L87 30.5 L60 39.5Z" fill="#1E2024" />
        <path d="M33 30.5 L60 21.5 L87 30.5" stroke="#ffffff" strokeOpacity="0.15" strokeWidth="1" fill="none" />
        <circle cx="60" cy="30.5" r="1.4" fill={BRASS} />
        <path d="M60 30.5 Q74 30 82 32 L83 43" stroke={BRASS} strokeWidth="1.2" fill="none" />
        <rect x="81.6" y="42" width="2.8" height="5" rx="1" fill={BRASS} />
      </>
    ),
  },

  tiger: {
    sleeve: () => "#E07B24",
    pants: () => "#E07B24",
    hood: "#E07B24",
    torso: () => (
      <>
        <Body fill="#E07B24" />
        <ellipse cx="60" cy="110" rx="10" ry="17" fill="#F6E3C8" />
        <path
          d="M41 88 L46 90 M41 98 L47 99 M41 108 L46 108 M79 88 L74 90 M79 98 L73 99 M79 108 L74 108"
          stroke="#1A1A1A"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </>
    ),
    head: () => (
      <>
        <circle cx="41" cy="26" r="6.5" fill="#E07B24" />
        <circle cx="79" cy="26" r="6.5" fill="#E07B24" />
        <circle cx="41" cy="26" r="3.5" fill="#F6C8B0" />
        <circle cx="79" cy="26" r="3.5" fill="#F6C8B0" />
        <path d="M53 25.5 L55 31 M60 23.5 L60 30 M67 25.5 L65 31" stroke="#1A1A1A" strokeWidth="2" strokeLinecap="round" />
      </>
    ),
  },

  dino: {
    sleeve: () => "#3E9E5A",
    pants: () => "#3E9E5A",
    hood: "#3E9E5A",
    torso: () => (
      <>
        <Body fill="#3E9E5A" />
        <ellipse cx="60" cy="110" rx="10" ry="17" fill="#BFE3A8" />
        {[98, 104, 110, 116, 122].map((y) => (
          <line key={y} x1="52" y1={y} x2="68" y2={y} stroke="#3E9E5A" strokeOpacity="0.35" strokeWidth="1" />
        ))}
      </>
    ),
    head: () => (
      <>
        <path d="M43 31 L47 20 L52 26 L57 16 L62 24 L67 16 L70 25 L75 20 L78 31 Q60 25 43 31Z" fill="#256B3C" />
        <circle cx="52" cy="29" r="1.4" fill="#BFE3A8" />
        <circle cx="68" cy="29" r="1.4" fill="#BFE3A8" />
      </>
    ),
  },
};
