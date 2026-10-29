"use client";

import { useId } from "react";
import { COSTUME_ART } from "@/components/character-costumes";
import { EYE_COLORS, HAIR_COLORS, SKINS, clothColor, type Look } from "@/lib/character";

// A member's character as layered SVG in the "Pool hall classic" style
// (docs/superpowers/specs/2026-10-29-characters-design.md). One 120×200
// drawing, framed three ways:
//   full: the whole figure with the cue (Profile, builder);
//   pop:  the avatar. Head and shoulders in a circle, the head rising a little
//         past the circle's top edge, the way Duolingo's do. The circle itself
//         is the caller's (components/character-face.tsx), so rings and the
//         backdrop colour stay CSS; this draws only the figure, clipped to the
//         circle below and to the head's width above;
//   bust: chest up, square, for builder tiles.
// Soft gradients (light from the upper left) give it some volume; their ids
// come from useId, so any number can share a page.

const VIEWS = { full: "0 0 120 200", bust: "14 2 100 100", pop: "27 6 66 91" } as const;
// The pop circle in drawing units: it fills the bottom 66×66 of the view box,
// so the head is about two thirds of the circle and its top rises past the
// edge. POP_ASPECT is the view box's width / height, for the caller's box.
export const POP_CIRCLE = { cx: 60, cy: 64, r: 33 } as const;
export const POP_ASPECT = "66 / 91";

const INK = "#1A120C";
const SHADE = "rgba(0,0,0,0.2)";
const LIGHT = "rgba(255,255,255,0.14)";
const BRASS = "#C9A96E";
const GOLD = "#FFDE59";
const SHIRT_WHITE = "#F3F1EC";

export function Character({
  look,
  view = "bust",
  crop,
  className,
  style,
  label,
}: {
  look: Look;
  view?: keyof typeof VIEWS;
  // A viewBox of its own, for a builder tile that frames one part.
  crop?: string;
  className?: string;
  style?: React.CSSProperties;
  // An accessible name; without one the drawing is decorative.
  label?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const skin = SKINS.find((s) => s.id === look.skin) ?? SKINS[0];
  const hair = HAIR_COLORS.find((h) => h.id === look.hairColor) ?? HAIR_COLORS[0];
  const beard = HAIR_COLORS.find((h) => h.id === look.facialHairColor) ?? hair;
  const eye = EYE_COLORS.find((e) => e.id === look.eyeColor)?.color ?? EYE_COLORS[0].color;
  // Brows stay a natural colour under a fun dye.
  const brow = hair.natural ? hair.color : HAIR_COLORS[1].color;
  // A costume dresses the whole figure and takes off the member's hat, all
  // but a headscarf, which stays on unless the costume brings headwear of its
  // own. A hood (like the headscarf) hides hair, ears and earrings.
  const costume = COSTUME_ART[look.outfit];
  const tint = clothColor(look.outfitColor);
  const scarf = look.hat === "headscarf" && !costume?.head && !costume?.hood;
  const hood = costume?.hood ?? (scarf ? clothColor(look.hatColor) : null);
  const wear = clothes(look);
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;
  const face = expression(look.expression);
  const hands = costume?.hands ?? url("skin");

  const figure = (
    <>
      {hood ? <ScarfBack color={hood} /> : <HairBack style={look.hair} fill={mix(hair.color, "#000000", 0.12)} />}
      {costume?.back?.(tint)}
      {view === "full" && <Legs color={wear.pants} />}
      <rect x="55.5" y="63" width="9" height="13" fill={skin.shade} />
      {costume ? costume.torso(tint) : <Torso look={look} />}
      <rect x="39" y="74" width="42" height="60" rx="10" fill={url("cloth")} />
      <ellipse cx="49" cy="77.5" rx="7" ry="2.2" fill="#ffffff" opacity="0.1" />
      {look.gear.includes("headphones") && <Headphones />}
      {look.gear.includes("chain") && <Chain />}
      {look.gear.includes("pin") && <Pin />}
      {scarf && <ScarfDrape color={clothColor(look.hatColor)} />}
      <Cue tier={look.cue} />
      <Arms sleeve={wear.sleeve} stripe={wear.sleeveStripe} />
      <circle cx="45" cy="140" r="5" fill={hands} />
      <circle cx="62" cy="104" r="5" fill={hands} />
      {look.gear.includes("glove") && <path d="M40 137 Q45 133 50 137 L50 143 Q45 146.5 40 143Z" fill="#141414" />}
      {look.gear.includes("towel") && <Towel />}
      {!hood && (
        <>
          <circle cx="39" cy="52" r="4" fill={url("skin")} />
          <circle cx="81" cy="52" r="4" fill={url("skin")} />
          <circle cx="39.6" cy="52.3" r="1.8" fill={skin.shade} />
          <circle cx="80.4" cy="52.3" r="1.8" fill={skin.shade} />
        </>
      )}
      <FaceShape shape={look.face} fill={url("skin")} />
      <ellipse cx="52" cy="37.5" rx="7" ry="3.2" fill="#ffffff" opacity="0.1" />
      <ellipse cx="48" cy="57.5" rx="3" ry="1.9" fill="#E58C82" opacity="0.3" />
      <ellipse cx="72" cy="57.5" rx="3" ry="1.9" fill="#E58C82" opacity="0.3" />
      <path d="M60.4 53 Q62.2 56.4 59.6 57" stroke={skin.shade} strokeWidth="1.5" fill="none" strokeLinecap="round" />
      <Eyes kind={face.eyes} iris={eye} />
      {costume?.face}
      <Brows kind={face.brows} color={brow} />
      <FacialHair style={look.facialHair} color={beard.color} />
      <Mouth kind={face.mouth} lip={skin.lip} />
      {hood ? <ScarfFront color={hood} /> : <HairFront style={look.hair} fill={url("hair")} />}
      <Eyewear style={look.eyewear} />
      {costume ? costume.head?.(tint) : !hood && <Hat style={look.hat} color={clothColor(look.hatColor)} />}
      {!hood && <Earrings style={look.earrings} />}
      {look.gear.includes("toothpick") && (
        <line x1="64" y1="60.5" x2="73" y2="58" stroke="#E6D2A6" strokeWidth="1.3" strokeLinecap="round" />
      )}
    </>
  );

  return (
    <svg
      viewBox={crop ?? VIEWS[view]}
      className={className}
      style={style}
      overflow={view === "pop" ? "visible" : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <defs>
        <radialGradient id={id("skin")} cx="0.38" cy="0.3" r="0.8">
          <stop offset="0" stopColor={mix(skin.base, "#ffffff", 0.16)} />
          <stop offset="0.55" stopColor={skin.base} />
          <stop offset="1" stopColor={mix(skin.base, "#000000", 0.16)} />
        </radialGradient>
        <linearGradient id={id("hair")} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor={mix(hair.color, "#ffffff", 0.2)} />
          <stop offset="0.5" stopColor={hair.color} />
          <stop offset="1" stopColor={mix(hair.color, "#000000", 0.22)} />
        </linearGradient>
        <linearGradient id={id("cloth")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.13" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.28" />
        </linearGradient>
        {view === "pop" && (
          <clipPath id={id("pop")}>
            <circle cx={POP_CIRCLE.cx} cy={POP_CIRCLE.cy} r={POP_CIRCLE.r} />
            <rect x="31" y="-10" width="58" height={POP_CIRCLE.cy + 10} />
          </clipPath>
        )}
      </defs>
      {view === "full" && <ellipse cx="60" cy="190" rx="24" ry="4.5" fill="#000000" opacity="0.35" />}
      {view === "pop" ? <g clipPath={url("pop")}>{figure}</g> : figure}
    </svg>
  );
}

// ---------- colour ----------

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => {
    const x = (pa >> shift) & 255;
    const y = (pb >> shift) & 255;
    return Math.round(x + (y - x) * t);
  };
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

// ---------- expressions ----------

type EyeKind = "open" | "closed" | "relaxed" | "wide" | "wink";
type BrowKind = "soft" | "arched" | "straight" | "focused" | "raised";
type MouthKind = "smile" | "grin" | "laugh" | "calm" | "smirk" | "o";

const EXPRESSION: Record<string, { eyes: EyeKind; brows: BrowKind; mouth: MouthKind }> = {
  happy: { eyes: "open", brows: "soft", mouth: "smile" },
  beaming: { eyes: "closed", brows: "arched", mouth: "grin" },
  laughing: { eyes: "closed", brows: "arched", mouth: "laugh" },
  calm: { eyes: "relaxed", brows: "soft", mouth: "calm" },
  cool: { eyes: "relaxed", brows: "straight", mouth: "smirk" },
  cheeky: { eyes: "wink", brows: "soft", mouth: "grin" },
  focused: { eyes: "open", brows: "focused", mouth: "calm" },
  surprised: { eyes: "wide", brows: "raised", mouth: "o" },
};

const expression = (id: string) => EXPRESSION[id] ?? EXPRESSION.happy;

function OpenEye({ cx, iris, wide = false }: { cx: number; iris: string; wide?: boolean }) {
  const rx = wide ? 3.4 : 3.1;
  const ry = wide ? 3.9 : 3.4;
  return (
    <>
      <ellipse cx={cx} cy="51" rx={rx} ry={ry} fill="#FFFFFF" />
      <circle cx={cx + 0.3} cy="51.6" r={wide ? 2.1 : 2.3} fill={iris} />
      <circle cx={cx + 0.3} cy="51.6" r="1.15" fill="#120C08" />
      <circle cx={cx + 1.1} cy="50.4" r="0.85" fill="#FFFFFF" />
      <circle cx={cx - 0.5} cy="52.7" r="0.4" fill="#FFFFFF" opacity="0.8" />
      <path
        d={`M${cx - rx - 0.1} ${51 - ry * 0.4} Q${cx} ${51 - ry - 0.6} ${cx + rx + 0.1} ${51 - ry * 0.4}`}
        stroke={INK}
        strokeWidth="1.1"
        fill="none"
        strokeLinecap="round"
      />
    </>
  );
}

function ClosedEye({ cx }: { cx: number }) {
  return <path d={`M${cx - 2.6} 52.2 Q${cx} 48.6 ${cx + 2.6} 52.2`} stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />;
}

function RelaxedEye({ cx, iris }: { cx: number; iris: string }) {
  return (
    <>
      <ellipse cx={cx} cy="51.8" rx="3.1" ry="2.3" fill="#FFFFFF" />
      <circle cx={cx + 0.3} cy="52.2" r="1.9" fill={iris} />
      <circle cx={cx + 0.3} cy="52.2" r="1" fill="#120C08" />
      <circle cx={cx + 1} cy="51.5" r="0.6" fill="#FFFFFF" />
      <path d={`M${cx - 3.4} 50.9 Q${cx} 49.2 ${cx + 3.4} 50.9`} stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
    </>
  );
}

function Eyes({ kind, iris }: { kind: EyeKind; iris: string }) {
  switch (kind) {
    case "closed":
      return (
        <>
          <ClosedEye cx={53} />
          <ClosedEye cx={67} />
        </>
      );
    case "relaxed":
      return (
        <>
          <RelaxedEye cx={53} iris={iris} />
          <RelaxedEye cx={67} iris={iris} />
        </>
      );
    case "wide":
      return (
        <>
          <OpenEye cx={53} iris={iris} wide />
          <OpenEye cx={67} iris={iris} wide />
        </>
      );
    case "wink":
      return (
        <>
          <OpenEye cx={53} iris={iris} />
          <ClosedEye cx={67} />
        </>
      );
    default:
      return (
        <>
          <OpenEye cx={53} iris={iris} />
          <OpenEye cx={67} iris={iris} />
        </>
      );
  }
}

const BROWS: Record<BrowKind, { d: string; w: number }> = {
  soft: { d: "M49.3 45 Q52.8 43.2 56.2 44.3 M63.8 44.3 Q67.2 43.2 70.7 45", w: 1.9 },
  arched: { d: "M49.3 45.4 Q52.5 41.6 56.2 43.9 M63.8 43.9 Q67.5 41.6 70.7 45.4", w: 1.9 },
  straight: { d: "M49.3 44.8 L56.2 44.3 M63.8 44.3 L70.7 44.8", w: 2.1 },
  focused: { d: "M49.3 44.6 Q52.8 44.4 56.4 45.6 M63.6 45.6 Q67.2 44.4 70.7 44.6", w: 2.8 },
  raised: { d: "M49.3 43.6 Q52.5 39.8 56.2 42 M63.8 42 Q67.5 39.8 70.7 43.6", w: 1.9 },
};

function Brows({ kind, color }: { kind: BrowKind; color: string }) {
  const b = BROWS[kind];
  return <path d={b.d} stroke={color} strokeWidth={b.w} fill="none" strokeLinecap="round" />;
}

function Mouth({ kind, lip }: { kind: MouthKind; lip: string }) {
  switch (kind) {
    case "grin":
      return (
        <>
          <path d="M54.5 59.2 Q60 66.5 65.5 59.2Z" fill="#3A140C" />
          <path d="M55.6 59.7 L64.4 59.7 Q63.9 61.3 60 61.5 Q56.1 61.3 55.6 59.7Z" fill="#FFFFFF" />
        </>
      );
    case "laugh":
      return (
        <>
          <path d="M54.2 58.8 Q60 68.5 65.8 58.8Z" fill="#3A140C" />
          <path d="M57 63.8 Q60 61.8 63 63.8 Q60 66.4 57 63.8Z" fill="#D8706A" />
          <path d="M55.3 59.3 L64.7 59.3 Q64.2 60.7 60 60.9 Q55.8 60.7 55.3 59.3Z" fill="#FFFFFF" />
        </>
      );
    case "calm":
      return <path d="M56.5 61 Q60 62 63.5 61" stroke={lip} strokeWidth="1.8" fill="none" strokeLinecap="round" />;
    case "smirk":
      return <path d="M55.5 61.2 Q60 62.3 65.2 59.2" stroke={lip} strokeWidth="1.9" fill="none" strokeLinecap="round" />;
    case "o":
      return <ellipse cx="60" cy="61.6" rx="2.2" ry="2.8" fill="#3A140C" />;
    default:
      return <path d="M55 60 Q60 64 65 60" stroke={lip} strokeWidth="2" fill="none" strokeLinecap="round" />;
  }
}

function FaceShape({ shape, fill }: { shape: string; fill: string }) {
  if (shape === "oval") return <ellipse cx="60" cy="50.5" rx="19.5" ry="22.5" fill={fill} />;
  if (shape === "soft") return <rect x="39" y="29" width="42" height="43" rx="17" fill={fill} />;
  return <circle cx="60" cy="50" r="21" fill={fill} />;
}

function FacialHair({ style, color }: { style: string; color: string }) {
  const mustache = "M51 59 Q55.5 55 60 57.5 Q64.5 55 69 59 Q64.5 61.5 60 60 Q55.5 61.5 51 59Z";
  switch (style) {
    case "stubble":
      return (
        <g fill={color} opacity="0.3">
          <path d="M40 52 C40 68 50 75 60 75 C70 75 80 68 80 52 C78 62 71 66 60 66 C49 66 42 62 40 52Z" />
          <path d="M53 58.2 Q60 56 67 58.2 Q60 59.4 53 58.2Z" />
        </g>
      );
    case "mustache":
      return <path d={mustache} fill={color} />;
    case "goatee":
      return (
        <>
          <path d="M55 64 Q60 66.2 65 64 Q64.5 70 60 71.2 Q55.5 70 55 64Z" fill={color} />
          <path d="M53.5 58.6 Q60 55.6 66.5 58.6 Q60 60 53.5 58.6Z" fill={color} />
        </>
      );
    case "beard":
      return (
        <>
          <path d="M39 50 C39 70 49 77 60 77 C71 77 81 70 81 50 C77 61 70 64 60 64 C50 64 43 61 39 50Z" fill={color} />
          <path d="M44 62 Q52 70 60 70.5" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="1.5" fill="none" />
          <path d={mustache} fill={color} />
        </>
      );
    default:
      return null;
  }
}

// ---------- clothes ----------

interface Wear {
  sleeve: string;
  sleeveStripe?: string;
  pants: string;
}

const OUTFIT_WEAR: Record<string, (look: Look) => Wear> = {
  varsity: () => ({ sleeve: "#F2EAD8", pants: "" }),
  hawaiian: (l) => ({ sleeve: clothColor(l.outfitColor), pants: "" }),
  denim: () => ({ sleeve: "#3D5A80", pants: "" }),
  track: (l) => ({ sleeve: clothColor(l.outfitColor), sleeveStripe: SHIRT_WHITE, pants: "" }),
  bowling: (l) => ({ sleeve: clothColor(l.outfitColor), pants: "" }),
  leather: () => ({ sleeve: "#1C1D21", pants: "" }),
  pinstripe: () => ({ sleeve: "#2A2D33", pants: "#2A2D33" }),
  tuxedo: () => ({ sleeve: "#121316", pants: "#121316" }),
  legend: () => ({ sleeve: "#F4F0E6", pants: "#121316" }),
  "cup-jacket": () => ({ sleeve: "#16181B", pants: "" }),
};

function clothes(look: Look): Wear {
  const pants = clothColor(look.pants);
  const costume = COSTUME_ART[look.outfit];
  if (costume) {
    const tint = clothColor(look.outfitColor);
    return { sleeve: costume.sleeve(tint), pants: costume.pants(tint) };
  }
  const outfit = OUTFIT_WEAR[look.outfit];
  if (outfit) {
    const w = outfit(look);
    return { ...w, pants: w.pants || pants };
  }
  return { sleeve: clothColor(look.topColor), pants };
}

function Arms({ sleeve, stripe }: { sleeve: string; stripe?: string }) {
  return (
    <>
      <line x1="42" y1="82" x2="45" y2="138" stroke={sleeve} strokeWidth="9" strokeLinecap="round" />
      <line x1="78" y1="82" x2="62" y2="104" stroke={sleeve} strokeWidth="9" strokeLinecap="round" />
      <line x1="44.6" y1="85" x2="47.2" y2="135" stroke="#000000" strokeOpacity="0.2" strokeWidth="3" />
      <line x1="39.8" y1="85" x2="42.4" y2="133" stroke="#ffffff" strokeOpacity="0.12" strokeWidth="2" />
      <line x1="80" y1="85.5" x2="66" y2="105" stroke="#000000" strokeOpacity="0.2" strokeWidth="3" />
      {stripe && (
        <>
          <line x1="42" y1="82" x2="45" y2="138" stroke={stripe} strokeWidth="1.6" />
          <line x1="78" y1="82" x2="62" y2="104" stroke={stripe} strokeWidth="1.6" />
        </>
      )}
    </>
  );
}

function Torso({ look }: { look: Look }) {
  switch (look.outfit) {
    case "varsity":
      return <Varsity color={clothColor(look.outfitColor)} />;
    case "hawaiian":
      return <Hawaiian color={clothColor(look.outfitColor)} />;
    case "denim":
      return <Denim />;
    case "track":
      return <Track color={clothColor(look.outfitColor)} />;
    case "bowling":
      return <Bowling color={clothColor(look.outfitColor)} />;
    case "leather":
      return <Leather />;
    case "pinstripe":
      return <Suit body="#2A2D33" lapel="#22252A" pinstripes tie="#7A1F2B" pocket={BRASS} />;
    case "tuxedo":
      return <Suit body="#121316" lapel="#2A2B30" bow="#0B0B0C" />;
    case "legend":
      return <Suit body="#F4F0E6" lapel="#E6DECB" trim={GOLD} bow="#0B0B0C" flower={GOLD} />;
    case "cup-jacket":
      return <Suit body="#16181B" lapel="#22252A" trim={BRASS} bow={BRASS} trophy />;
  }
  const top = clothColor(look.topColor);
  const layer = clothColor(look.layerColor);
  const neck = clothColor(look.neckColor);
  const vest = look.layer === "vest";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={top} />
      <Top kind={look.top} />
      {look.neck === "tie" && <Tie color={neck} long={!vest} />}
      {vest && <Vest color={layer} />}
      {look.layer === "suspenders" && <Suspenders color={layer} />}
      {look.neck === "bow" && <Bow color={neck} />}
      {look.neck === "flame-bow" && <FlameBow />}
    </>
  );
}

function Top({ kind }: { kind: string }) {
  switch (kind) {
    case "polo":
      return (
        <>
          <path d="M51 73 L60 77.5 L57 82.5Z M69 73 L60 77.5 L63 82.5Z" fill={SHADE} />
          <rect x="59" y="77.5" width="2" height="12" fill={SHADE} />
          <circle cx="60" cy="82" r="0.9" fill={LIGHT} />
          <circle cx="60" cy="86.5" r="0.9" fill={LIGHT} />
        </>
      );
    case "tee":
      return <path d="M53 73.5 Q60 79.5 67 73.5" stroke={SHADE} strokeWidth="2.2" fill="none" />;
    case "hoodie":
      return (
        <>
          <path d="M44.5 74 Q60 89 75.5 74 Q72 69.5 60 70.5 Q48 69.5 44.5 74Z" fill={SHADE} />
          <path d="M57 79 L56.4 91 M63 79 L63.6 91" stroke={SHIRT_WHITE} strokeWidth="1" strokeLinecap="round" />
          <path d="M48 112 L72 112 L70 125 L50 125Z" fill={SHADE} />
        </>
      );
    default:
      return (
        <>
          <line x1="60" y1="80" x2="60" y2="134" stroke={SHADE} strokeWidth="0.8" />
          <path d="M52.5 73 L60 79.5 L56 83.5Z M67.5 73 L60 79.5 L64 83.5Z" fill="#ffffff" opacity="0.35" />
          <path d="M52.5 73 L60 79.5 L56 83.5Z M67.5 73 L60 79.5 L64 83.5Z" fill="none" stroke={SHADE} strokeWidth="0.7" />
        </>
      );
  }
}

function Vest({ color }: { color: string }) {
  return (
    <>
      <path d="M39 84 Q39 74 49 74 L55 74 L60 104 L60 134 L47 134 Q39 134 39 126Z" fill={color} />
      <path d="M81 84 Q81 74 71 74 L65 74 L60 104 L60 134 L73 134 Q81 134 81 126Z" fill={color} />
      <path d="M55 74 L60 104 L65 74" stroke={SHADE} strokeWidth="0.9" fill="none" />
      <path d="M44 100 L51 99 M69 99 L76 100" stroke={LIGHT} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="60" cy="112" r="1.5" fill={BRASS} />
      <circle cx="60" cy="122" r="1.5" fill={BRASS} />
    </>
  );
}

function Suspenders({ color }: { color: string }) {
  return (
    <>
      <path d="M48 75 L50.5 134 M72 75 L69.5 134" stroke={color} strokeWidth="3" />
      <rect x="47" y="96" width="4" height="3" rx="0.8" fill={BRASS} />
      <rect x="69" y="96" width="4" height="3" rx="0.8" fill={BRASS} />
    </>
  );
}

function Bow({ color }: { color: string }) {
  return (
    <>
      <path d="M60 78 L52 74 L52 82Z M60 78 L68 74 L68 82Z" fill={color} />
      <path d="M60 78 L52 74 L52 82Z M60 78 L68 74 L68 82Z" fill="none" stroke={SHADE} strokeWidth="0.6" />
      <circle cx="60" cy="78" r="1.7" fill={color} stroke={SHADE} strokeWidth="0.6" />
    </>
  );
}

function FlameBow() {
  return (
    <>
      <path d="M60 78 L51 73 L51 83Z M60 78 L69 73 L69 83Z" fill="#E8873A" />
      <path
        d="M60 73.6 C61.3 75.6 62.7 76.5 62.7 78.5 C62.7 80.1 61.5 81.2 60 81.2 C58.5 81.2 57.3 80.1 57.3 78.7 C57.3 77.3 58.3 76.5 58.9 75.9 C59 76.9 59.5 77.5 60 77.5 C59.7 76.1 59.7 74.7 60 73.6Z"
        fill={GOLD}
      />
    </>
  );
}

function Tie({ color, long }: { color: string; long: boolean }) {
  return (
    <>
      <path d="M57.5 74 L62.5 74 L61.5 78.5 L58.5 78.5Z" fill={color} />
      <path
        d={long ? "M58.5 78 L61.5 78 L63.8 108 L60 112.5 L56.2 108Z" : "M58.5 78 L61.5 78 L63.5 98 L60 102 L56.5 98Z"}
        fill={color}
      />
      <path d="M57.5 74 L62.5 74 L61.5 78.5 L58.5 78.5Z" fill={SHADE} />
    </>
  );
}

function Varsity({ color }: { color: string }) {
  const cream = "#F2EAD8";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={color} />
      <path d="M54 74 Q60 78.5 66 74" fill={SHIRT_WHITE} />
      <path d="M49.5 74 Q60 84 70.5 74" stroke={cream} strokeWidth="3" fill="none" />
      <path d="M49.5 74 Q60 84 70.5 74" stroke={color} strokeWidth="1" fill="none" />
      <line x1="60" y1="80" x2="60" y2="129" stroke={SHADE} strokeWidth="0.9" />
      {[88, 98, 108, 118].map((y) => (
        <circle key={y} cx="60" cy={y} r="1.2" fill={cream} />
      ))}
      <rect x="39.5" y="127" width="41" height="4" fill={cream} />
      <rect x="39.5" y="128.3" width="41" height="1.2" fill={color} />
      <circle cx="70" cy="95" r="5" fill={cream} />
      <circle cx="70" cy="95" r="3.6" fill="#141414" />
      <circle cx="70" cy="95" r="1.6" fill={SHIRT_WHITE} />
    </>
  );
}

function Hawaiian({ color }: { color: string }) {
  const flowers: [number, number][] = [
    [47, 90],
    [71, 97],
    [52, 117],
    [73, 122],
    [65, 84],
    [44, 128],
  ];
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={color} />
      {flowers.map(([x, y]) => (
        <g key={`${x}-${y}`}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle
              key={a}
              cx={x + 2.2 * Math.cos((a * Math.PI) / 180)}
              cy={y + 2.2 * Math.sin((a * Math.PI) / 180)}
              r="1.7"
              fill="#ffffff"
              opacity="0.85"
            />
          ))}
          <circle cx={x} cy={y} r="1.1" fill={GOLD} />
        </g>
      ))}
      <line x1="60" y1="82" x2="60" y2="134" stroke={SHADE} strokeWidth="0.9" />
      <path d="M51 73 L60 80 L57.5 87 L49.5 76.5Z M69 73 L60 80 L62.5 87 L70.5 76.5Z" fill={color} />
      <path d="M51 73 L60 80 L57.5 87 L49.5 76.5Z M69 73 L60 80 L62.5 87 L70.5 76.5Z" fill={LIGHT} stroke={SHADE} strokeWidth="0.6" />
    </>
  );
}

function Denim() {
  const denim = "#3D5A80";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={denim} />
      <path d="M54 74 L66 74 L64.5 134 L55.5 134Z" fill={SHIRT_WHITE} />
      <path d="M54 74 Q60 78 66 74" stroke={SHADE} strokeWidth="1.2" fill="none" />
      <path d="M49 73 L55 74 L56.5 90 L51 83Z M71 73 L65 74 L63.5 90 L69 83Z" fill="#33507A" />
      <rect x="43" y="92" width="8" height="7" rx="1" fill="none" stroke={BRASS} strokeWidth="0.7" strokeDasharray="1.2 0.8" opacity="0.8" />
      <rect x="69" y="92" width="8" height="7" rx="1" fill="none" stroke={BRASS} strokeWidth="0.7" strokeDasharray="1.2 0.8" opacity="0.8" />
      <path d="M55.5 100 L55.5 134 M64.5 100 L64.5 134" stroke={BRASS} strokeWidth="0.7" strokeDasharray="1.2 0.8" opacity="0.6" />
    </>
  );
}

function Track({ color }: { color: string }) {
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={color} />
      <path d="M52 73 Q60 76 68 73 L68 78 Q60 81 52 78Z" fill={SHADE} />
      <line x1="60" y1="77" x2="60" y2="134" stroke={SHIRT_WHITE} strokeWidth="1.1" />
      <path d="M42.5 84 L42.5 130 M77.5 84 L77.5 130" stroke={SHIRT_WHITE} strokeWidth="2.2" />
    </>
  );
}

function Bowling({ color }: { color: string }) {
  const panel = "#F2EAD8";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={color} />
      <path d="M50 76 L56 76 L56 134 L50 134Z M64 76 L70 76 L70 134 L64 134Z" fill={panel} />
      <line x1="60" y1="80" x2="60" y2="134" stroke={SHADE} strokeWidth="0.8" />
      {[90, 102, 114].map((y) => (
        <circle key={y} cx="60" cy={y} r="1" fill={SHADE} />
      ))}
      <path d="M51 73 L60 80 L57.5 86 L49.5 76.5Z M69 73 L60 80 L62.5 86 L70.5 76.5Z" fill={panel} stroke={SHADE} strokeWidth="0.6" />
      <rect x="71" y="88" width="7" height="3" rx="1" fill={BRASS} />
    </>
  );
}

function Leather() {
  const black = "#1C1D21";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={black} />
      <path d="M54.5 74 L65.5 74 L63 100 L57 100Z" fill={SHIRT_WHITE} />
      <path d="M48.5 73 L57.5 76 L55 93 L45.5 82Z M71.5 73 L62.5 76 L65 93 L74.5 82Z" fill="#2C2E33" />
      <path d="M57.5 100 L55.5 134" stroke="#B8BDC4" strokeWidth="1.1" />
      <path d="M44 90 Q46.5 110 44 127" stroke="#ffffff" strokeWidth="2.5" opacity="0.07" fill="none" />
      <circle cx="47" cy="81" r="0.9" fill="#B8BDC4" />
      <circle cx="73" cy="81" r="0.9" fill="#B8BDC4" />
    </>
  );
}

function Suit({
  body,
  lapel,
  pinstripes,
  tie,
  bow,
  pocket,
  trim,
  flower,
  trophy,
}: {
  body: string;
  lapel: string;
  pinstripes?: boolean;
  tie?: string;
  bow?: string;
  pocket?: string;
  trim?: string;
  flower?: string;
  trophy?: boolean;
}) {
  const lapels = "M54 74 L60 99 L52.5 92 L46.5 78 Q48 74 54 74Z M66 74 L60 99 L67.5 92 L73.5 78 Q72 74 66 74Z";
  return (
    <>
      <rect x="39" y="74" width="42" height="60" rx="10" fill={body} />
      {pinstripes &&
        [43, 47, 51, 55, 65, 69, 73, 77].map((x) => (
          <line key={x} x1={x} y1="76" x2={x} y2="133" stroke="#6B7480" strokeWidth="0.45" opacity="0.7" />
        ))}
      <path d="M54 74 L66 74 L60 99Z" fill={SHIRT_WHITE} />
      {tie && (
        <>
          <path d="M58.2 74.5 L61.8 74.5 L61 78 L59 78Z" fill={tie} />
          <path d="M59 77.6 L61 77.6 L62.2 93 L60 96 L57.8 93Z" fill={tie} />
        </>
      )}
      <path d={lapels} fill={lapel} />
      {trim && <path d={lapels} fill="none" stroke={trim} strokeWidth="1.1" />}
      {bow && <Bow color={bow} />}
      <circle cx="60" cy="106" r="1.3" fill={trim ?? SHADE} />
      <circle cx="60" cy="116" r="1.3" fill={trim ?? SHADE} />
      {pocket && <path d="M67.5 88.5 L73.5 88.5 L72.5 91.5 L68.5 91.5Z" fill={pocket} />}
      {flower && (
        <>
          <circle cx="70" cy="87" r="2.4" fill={flower} />
          <circle cx="70" cy="87" r="1" fill="#C98A1A" />
        </>
      )}
      {trophy && (
        <g>
          <path d="M67 90 L73 90 L72.4 94.5 Q70 96.5 67.6 94.5Z" fill={BRASS} />
          <rect x="69.4" y="96" width="1.2" height="2.5" fill={BRASS} />
          <rect x="67.8" y="98.3" width="4.4" height="1.4" rx="0.5" fill={BRASS} />
        </g>
      )}
    </>
  );
}

function Legs({ color }: { color: string }) {
  return (
    <>
      <rect x="47" y="128" width="12" height="58" rx="5" fill={color} />
      <rect x="61" y="128" width="12" height="58" rx="5" fill={color} />
      <rect x="54" y="130" width="5" height="54" rx="2.5" fill="#000000" opacity="0.18" />
      <rect x="68" y="130" width="5" height="54" rx="2.5" fill="#000000" opacity="0.18" />
      <ellipse cx="52" cy="189" rx="10" ry="4.5" fill="#0B0C0E" />
      <ellipse cx="68" cy="189" rx="10" ry="4.5" fill="#0B0C0E" />
      <ellipse cx="49" cy="187.2" rx="3.5" ry="1.2" fill="#ffffff" opacity="0.14" />
      <ellipse cx="65" cy="187.2" rx="3.5" ry="1.2" fill="#ffffff" opacity="0.14" />
    </>
  );
}

// ---------- gear ----------

function Headphones() {
  return (
    <>
      <path d="M45 70 Q60 86 75 70" stroke="#2A2D33" strokeWidth="3" fill="none" />
      <ellipse cx="45" cy="71" rx="4" ry="5.5" fill="#3A3F46" />
      <ellipse cx="75" cy="71" rx="4" ry="5.5" fill="#3A3F46" />
      <ellipse cx="45" cy="71" rx="1.8" ry="3" fill={BRASS} opacity="0.7" />
      <ellipse cx="75" cy="71" rx="1.8" ry="3" fill={BRASS} opacity="0.7" />
    </>
  );
}

function Chain() {
  return (
    <>
      <path d="M51 75 Q60 92 69 75" stroke={BRASS} strokeWidth="1.8" fill="none" strokeDasharray="2 1" />
      <circle cx="60" cy="88" r="2.2" fill={BRASS} />
    </>
  );
}

// Season champion: a gold medallion with a star, on the right chest.
function Pin() {
  return (
    <>
      <path d="M68.5 88 L70 94 M73.5 88 L72 94" stroke="#7A1F2B" strokeWidth="1.6" />
      <circle cx="71" cy="96" r="3.2" fill={GOLD} />
      <path
        d="M71 93.9 L71.6 95.4 L73.1 95.4 L71.9 96.4 L72.4 97.9 L71 97 L69.6 97.9 L70.1 96.4 L68.9 95.4 L70.4 95.4Z"
        fill="#9A7A1A"
      />
    </>
  );
}

// House pro: a club towel over the left shoulder.
function Towel() {
  return (
    <>
      <path d="M38 77 Q44 72 50 76 L49 105 Q45 107 41 104Z" fill={SHIRT_WHITE} />
      <path d="M41.2 97 L49.3 97 M41.1 100.5 L49.2 100.5" stroke={BRASS} strokeWidth="1.5" />
      <path d="M44 76 L43.5 104" stroke={SHADE} strokeWidth="0.6" />
    </>
  );
}

// ---------- the cue ----------

// Along the line from the butt (20,194) to the tip (100,22). The right hand
// sits at t≈0.525, so the forearm and the joint collar above it show in the
// avatar too: the cue a member carries reads even at chat size.
const CUE_TIERS: Record<string, { butt: string; wrap: string; fore: string; collar: string; shaft: string; inlay?: string }> = {
  house: { butt: "#6B4A2E", wrap: "#6B4A2E", fore: "#8A6440", collar: "#D9C49A", shaft: "#E6D2A6" },
  regular: { butt: "#2A1E16", wrap: "#141414", fore: "#C9A57A", collar: "#ECEAE4", shaft: "#E6D2A6", inlay: "#ECEAE4" },
  shark: { butt: "#3A4048", wrap: "#1C2026", fore: "#6E7884", collar: "#C9CDD3", shaft: "#E6D2A6", inlay: "#C9CDD3" },
  hustler: { butt: "#1A1410", wrap: "#6B2737", fore: "#1A1410", collar: BRASS, shaft: "#E6D2A6", inlay: BRASS },
  master: { butt: "#3A0F17", wrap: "#141414", fore: "#5A1A24", collar: GOLD, shaft: "#2A2C30", inlay: GOLD },
  legend: { butt: "#ECEAE4", wrap: "#141414", fore: "#F4F0E6", collar: GOLD, shaft: "#1C1D20", inlay: GOLD },
};

const at = (t: number) => ({ x: 20 + 80 * t, y: 194 - 172 * t });

function Seg({ from, to, color, width }: { from: number; to: number; color: string; width: number }) {
  const a = at(from);
  const b = at(to);
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={width} strokeLinecap="butt" />;
}

function Cue({ tier }: { tier: string }) {
  const c = CUE_TIERS[tier] ?? CUE_TIERS.house;
  const tip = at(1);
  return (
    <g>
      <Seg from={0} to={0.3} color={c.butt} width={4.8} />
      <Seg from={0.3} to={0.45} color={c.wrap} width={4.6} />
      <Seg from={0.45} to={0.6} color={c.fore} width={4.2} />
      <Seg from={0.6} to={0.625} color={c.collar} width={4.2} />
      <Seg from={0.625} to={0.985} color={c.shaft} width={3} />
      <Seg from={0.985} to={0.993} color="#F7F5EF" width={3} />
      <Seg from={0.993} to={1} color="#4FA3F7" width={3.4} />
      <line x1={at(0).x - 1} y1={at(0).y - 0.5} x2={tip.x - 1} y2={tip.y - 0.5} stroke="#ffffff" strokeOpacity="0.18" strokeWidth="0.9" />
      <circle cx={at(0).x} cy={at(0).y} r="2.4" fill="#0B0C0E" />
      {c.inlay &&
        [0.08, 0.16, 0.5, 0.56].map((t) => (
          <circle key={t} cx={at(t).x} cy={at(t).y} r="1" fill={c.inlay} />
        ))}
      {tier === "legend" && <circle cx={tip.x} cy={tip.y} r="3.4" fill="#4FA3F7" opacity="0.25" />}
    </g>
  );
}

// ---------- hair ----------

const SHINE = "M47 31.5 Q53.5 28.6 60.5 28.4";

function HairBack({ style, fill }: { style: string; fill: string }) {
  switch (style) {
    case "afro":
      return <circle cx="60" cy="40" r="28.5" fill={fill} />;
    case "waves":
      return (
        <path
          d="M36 50 C34 28 47 22 60 22 C73 22 86 28 84 50 C86 60 88 68 84 77 C80 73 78 75 74 77 L46 77 C42 75 40 73 36 77 C32 68 34 60 36 50Z"
          fill={fill}
        />
      );
    case "long":
      return <path d="M35 52 C35 28 47 23 60 23 C73 23 85 28 85 52 L86 84 Q60 88 34 84Z" fill={fill} />;
    case "bob":
      return <path d="M36 50 C36 29 48 24 60 24 C72 24 84 29 84 50 L84 66 Q78 70 73 66 L47 66 Q42 70 36 66Z" fill={fill} />;
    case "ponytail":
      return (
        <>
          <circle cx="83" cy="42" r="7" fill={fill} />
          <path d="M86 45 Q93 57 86 69 Q84 57 82 48Z" fill={fill} />
        </>
      );
    case "bun":
      return (
        <>
          <circle cx="60" cy="22.5" r="8.5" fill={fill} />
          <path d="M55 19 Q60 16.5 65 19" stroke={LIGHT} strokeWidth="1.4" fill="none" strokeLinecap="round" />
        </>
      );
    case "braids":
      return (
        <g fill={fill}>
          {[55, 61, 67, 73, 79].map((y) => (
            <g key={y}>
              <ellipse cx="38.5" cy={y} rx="3.3" ry="3.7" />
              <ellipse cx="81.5" cy={y} rx="3.3" ry="3.7" />
            </g>
          ))}
        </g>
      );
    case "locs":
      return (
        <g fill={fill}>
          <rect x="33.5" y="42" width="5" height="36" rx="2.5" />
          <rect x="38.5" y="48" width="4.5" height="32" rx="2.25" />
          <rect x="81.5" y="42" width="5" height="36" rx="2.5" />
          <rect x="77" y="48" width="4.5" height="32" rx="2.25" />
        </g>
      );
    default:
      return null;
  }
}

function HairFront({ style, fill }: { style: string; fill: string }) {
  const shine = <path d={SHINE} stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  switch (style) {
    case "buzz":
      return (
        <path d="M39.5 46 C40 33 49 28.5 60 28.5 C71 28.5 80 33 80.5 46 C76 39 69 37 60 37 C51 37 44 39 39.5 46Z" fill={fill} opacity="0.92" />
      );
    case "crop":
      return (
        <>
          <path d="M38 48 C38 30 50 26 61 26 C74 26 83 33 82 48 C78 38 70 35 60 36 C50 36 42 40 38 48Z" fill={fill} />
          {shine}
        </>
      );
    case "side-part":
      return (
        <>
          <path
            d="M38 50 C36.5 30 49 25 61 25 C75 25 84.5 32 82 49 C80 42 77 38 72 36 C66 39 53 40 45 39 C41.5 42 39.5 45 38 50Z"
            fill={fill}
          />
          <path d="M66 26.5 Q70 31 72 36" stroke={SHADE} strokeWidth="1" fill="none" />
          {shine}
        </>
      );
    case "quiff":
      return (
        <>
          <path
            d="M38 48 C37.5 33 45 27.5 52 26.5 C55 17 70 15.5 77 23 C71 21.8 65 23 62.5 27 C74.5 27.5 83.5 34 82 48 C78 38 70 35 60 36 C50 36 42 40 38 48Z"
            fill={fill}
          />
          <path d="M54 25 Q60 19.5 70 20" stroke="#ffffff" strokeOpacity="0.2" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </>
      );
    case "curly":
      return (
        <g fill={fill}>
          {(
            [
              [41, 44, 5.2],
              [45, 37, 6],
              [52, 32.5, 6.5],
              [60, 30.5, 6.8],
              [68, 32.5, 6.5],
              [75, 37, 6],
              [79, 44, 5.2],
            ] as const
          ).map(([x, y, r]) => (
            <circle key={x} cx={x} cy={y} r={r} />
          ))}
          <circle cx="49" cy="30" r="2" fill="#ffffff" fillOpacity="0.16" />
          <circle cx="63" cy="27.5" r="2" fill="#ffffff" fillOpacity="0.16" />
        </g>
      );
    case "afro":
      return <path d="M39 47 C40 37 49 33 60 33 C71 33 80 37 81 47 C77 41 69 38.5 60 38.5 C51 38.5 43 41 39 47Z" fill={fill} />;
    case "waves":
      return (
        <>
          <path d="M39 49 C39 31 50 26 61 26 C73 26 82 32 81 48 C77 38 68 34 57 35 C50 37 44 42 39 49Z" fill={fill} />
          {shine}
        </>
      );
    case "long":
      return (
        <>
          <path d="M39 51 C38.5 31 49 26 60 26 C71 26 81.5 31 81 51 C79 41 72 34 61 31.5 L59 31.5 C48 34 41 41 39 51Z" fill={fill} />
          {shine}
        </>
      );
    case "bob":
      return (
        <>
          <path
            d="M38.5 52 C37.5 32 48 27 60 27 C72 27 82.5 32 81.5 52 C79 44 76 40 70 38 C62 41 50 41 44 38 C41 42 39.5 46 38.5 52Z"
            fill={fill}
          />
          {shine}
        </>
      );
    case "ponytail":
      return (
        <>
          <path d="M38.5 50 C38 31 49 26 61 26 C73 26 82 32 81.5 48 C77 39 70 35.5 61 35.5 C55 37 47 40 38.5 50Z" fill={fill} />
          <circle cx="82.5" cy="47" r="1.6" fill={BRASS} />
          {shine}
        </>
      );
    case "bun":
      return (
        <>
          <path d="M39 48 C39 32 49 27 60 27 C71 27 81 32 81 48 C77 39 70 35 60 35 C50 35 43 39 39 48Z" fill={fill} />
          <path d="M54.5 28.6 Q60 26.6 65.5 28.6" stroke={SHADE} strokeWidth="1.5" fill="none" />
        </>
      );
    case "braids":
      return (
        <>
          <path d="M38.5 49 C38 31 49 26.5 60 26.5 C71 26.5 82 31 81.5 49 C78 40 70 36 60 36 C50 36 42 40 38.5 49Z" fill={fill} />
          <path
            d="M48 37.5 Q47 31 52 27.5 M56 36 Q55.5 30 58 26.5 M64 36 Q64.5 30 62 26.5 M72 37.5 Q73 31 68 27.5"
            stroke="#ffffff"
            strokeOpacity="0.14"
            strokeWidth="1"
            fill="none"
          />
        </>
      );
    case "locs":
      return (
        <>
          <path d="M38.5 48 C38 31 49 26.5 60 26.5 C71 26.5 82 31 81.5 48 C78 39 70 35 60 35 C50 35 42 39 38.5 48Z" fill={fill} />
          <rect x="40" y="38" width="4.5" height="17" rx="2.25" fill={fill} />
          <rect x="75.5" y="38" width="4.5" height="17" rx="2.25" fill={fill} />
          <path d="M50 35 L50 29 M56 34.5 L56 27.5 M64 34.5 L64 27.5 M70 35 L70 29" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1" />
        </>
      );
    case "bald":
      return <ellipse cx="54" cy="33" rx="6" ry="2.6" fill="#ffffff" opacity="0.12" />;
    default:
      return null;
  }
}

// ---------- headwear ----------

function ScarfBack({ color }: { color: string }) {
  return <path d="M34 54 C33 28 46 21 60 21 C74 21 87 28 86 54 C87 66 84 76 78 82 L42 82 C36 76 33 66 34 54Z" fill={color} />;
}

function ScarfDrape({ color }: { color: string }) {
  return (
    <>
      <path d="M40 73 Q60 90 80 73 L82 86 Q60 101 38 86Z" fill={color} />
      <path d="M40 73 Q60 90 80 73" stroke={SHADE} strokeWidth="0.9" fill="none" />
    </>
  );
}

function ScarfFront({ color }: { color: string }) {
  return (
    <>
      <path d="M38.5 50 C38.5 33 48 27 60 27 C72 27 81.5 33 81.5 50 C80 40 72 34 60 34 C48 34 40 40 38.5 50Z" fill={color} />
      <path d="M37 46 C36 58 40 68 48 73.5 L44 77 C36 71 34 58 37 46Z M83 46 C84 58 80 68 72 73.5 L76 77 C84 71 86 58 83 46Z" fill={color} />
      <path d="M41 42 Q60 30 79 42" stroke={LIGHT} strokeWidth="1.2" fill="none" />
    </>
  );
}

function Hat({ style, color }: { style: string; color: string }) {
  const band = color === BRASS ? "#141414" : BRASS;
  switch (style) {
    case "flatcap":
      return (
        <>
          <path d="M38 46 C38 30 50 26 61 26 C74 26 84 32 83 44Z" fill={color} />
          <path d="M58 44 Q80 41 91 47 Q78 51 58 48Z" fill={color} />
          <path d="M58 44 Q80 41 91 47 Q78 51 58 48Z" fill={SHADE} />
          <path d="M44 33 Q58 27.5 74 31" stroke={LIGHT} strokeWidth="1.4" fill="none" />
        </>
      );
    case "fedora":
      return (
        <>
          <ellipse cx="60" cy="34" rx="28" ry="5" fill={color} />
          <ellipse cx="60" cy="34" rx="28" ry="5" fill={SHADE} />
          <path d="M44 34 C44 18 50 13 60 13 C70 13 76 18 76 34Z" fill={color} />
          <path d="M48 31 C48 20 52 16 58 15.5" stroke={LIGHT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <rect x="44" y="28" width="32" height="4" fill={band} />
          <path d="M54 16.5 Q60 20.5 66 16.5" stroke={SHADE} strokeWidth="1.2" fill="none" />
        </>
      );
    case "beanie":
      return (
        <>
          <path d="M38 44 C38 24 50 19 60 19 C70 19 82 24 82 44Z" fill={color} />
          <path d="M44 38 C45 28 51 23.5 58 22.5" stroke={LIGHT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <rect x="37" y="39" width="46" height="8" rx="3" fill={color} />
          <rect x="37" y="39" width="46" height="8" rx="3" fill={LIGHT} />
          {[42, 47, 52, 57, 62, 67, 72, 77].map((x) => (
            <line key={x} x1={x} y1="40" x2={x} y2="46" stroke={SHADE} strokeWidth="0.8" />
          ))}
          <circle cx="60" cy="18" r="4.5" fill={SHIRT_WHITE} />
        </>
      );
    case "backcap":
      return (
        <>
          <path d="M38 44 C38 25 50 21 61 21 C74 21 84 27 83 44Z" fill={color} />
          <path d="M44 38 C45 29 51 25 58 24" stroke={LIGHT} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          <path d="M40 40 Q27 39 21 46 Q31 49 41 46Z" fill={color} />
          <path d="M40 40 Q27 39 21 46 Q31 49 41 46Z" fill={SHADE} />
          <circle cx="61" cy="22" r="1.8" fill={BRASS} />
        </>
      );
    case "bucket":
      return (
        <>
          <path d="M41 40 C42 26 50 22 60 22 C70 22 78 26 79 40Z" fill={color} />
          <path d="M33 44 Q60 33 87 44 L85 48.5 Q60 39 35 48.5Z" fill={color} />
          <path d="M33 44 Q60 33 87 44 L85 48.5 Q60 39 35 48.5Z" fill={SHADE} />
          <path d="M41.5 37 Q60 32 78.5 37" stroke={band} strokeWidth="1.6" fill="none" />
        </>
      );
    case "headband":
      return (
        <>
          <rect x="38" y="36" width="44" height="6" rx="3" fill={color} />
          <line x1="39" y1="39" x2="81" y2="39" stroke={LIGHT} strokeWidth="1.2" />
        </>
      );
    default:
      return null;
  }
}

// ---------- face extras ----------

function Eyewear({ style }: { style: string }) {
  switch (style) {
    case "round":
      return (
        <>
          <circle cx="53" cy="51" r="5.4" stroke={BRASS} strokeWidth="1.4" fill="#ffffff" fillOpacity="0.08" />
          <circle cx="67" cy="51" r="5.4" stroke={BRASS} strokeWidth="1.4" fill="#ffffff" fillOpacity="0.08" />
          <line x1="58.4" y1="50.5" x2="61.6" y2="50.5" stroke={BRASS} strokeWidth="1.4" />
          <path d="M47.6 50 L40 49 M72.4 50 L80 49" stroke={BRASS} strokeWidth="1" />
        </>
      );
    case "square":
      return (
        <>
          <rect x="47" y="46.4" width="11.6" height="9" rx="2" stroke="#141414" strokeWidth="1.6" fill="#ffffff" fillOpacity="0.08" />
          <rect x="61.4" y="46.4" width="11.6" height="9" rx="2" stroke="#141414" strokeWidth="1.6" fill="#ffffff" fillOpacity="0.08" />
          <line x1="58.6" y1="49.5" x2="61.4" y2="49.5" stroke="#141414" strokeWidth="1.6" />
          <path d="M47 49 L40 48.5 M73 49 L80 48.5" stroke="#141414" strokeWidth="1.2" />
        </>
      );
    case "shades":
      return (
        <>
          <rect x="46" y="46.5" width="11.5" height="8" rx="3" fill="#0B0C0E" />
          <rect x="62.5" y="46.5" width="11.5" height="8" rx="3" fill="#0B0C0E" />
          <line x1="57.5" y1="49" x2="62.5" y2="49" stroke="#0B0C0E" strokeWidth="1.6" />
          <line x1="48" y1="48.5" x2="51" y2="48.5" stroke="#5B6470" strokeWidth="1" strokeLinecap="round" />
          <line x1="64.5" y1="48.5" x2="67.5" y2="48.5" stroke="#5B6470" strokeWidth="1" strokeLinecap="round" />
        </>
      );
    default:
      return null;
  }
}

function Earrings({ style }: { style: string }) {
  if (style === "stud")
    return (
      <>
        <circle cx="39" cy="56.6" r="1.4" fill={BRASS} />
        <circle cx="81" cy="56.6" r="1.4" fill={BRASS} />
      </>
    );
  if (style === "hoop")
    return (
      <>
        <circle cx="39.2" cy="58.8" r="2.6" stroke={BRASS} strokeWidth="1.2" fill="none" />
        <circle cx="80.8" cy="58.8" r="2.6" stroke={BRASS} strokeWidth="1.2" fill="none" />
      </>
    );
  return null;
}
