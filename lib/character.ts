// Characters: every member's pool-hall figure, built piece by piece
// (docs/superpowers/specs/2026-10-29-characters-design.md). This file is the
// catalogue and the rules, with no drawing and no I/O: which parts exist, which
// are earned and how, the starter look every member gets before they build
// their own, and the guard that turns any stored value back into a valid look.
// The drawing is components/character.tsx.
import { TITLES, type TitleName } from "@/lib/levels";

// The switch: characters are on where NEXT_PUBLIC_CHARACTERS is "1" (set in
// Vercel to turn them on for everyone; unset, the app keeps its photos and
// balls). Inlined into the browser bundle, so server and client agree.
export function charactersEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CHARACTERS === "1";
}

// The /character-preview page of invented members: a building aid, never
// served in production (Vercel sets NEXT_PUBLIC_VERCEL_ENV itself).
export function characterPreviewEnabled(): boolean {
  return charactersEnabled() && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
}

// ---------- colours ----------

// Skin tones are numbered, never named. First comes chalk: a pale pool-chalk
// blue that is plainly nobody's skin, which every starter wears, so the app
// never guesses at a member's skin tone before they choose one.
export const NEUTRAL_SKIN = "chalk";
export const SKINS = [
  { id: NEUTRAL_SKIN, base: "#C3D3E6", shade: "#A6BAD2", lip: "#6F86A3" },
  { id: "s1", base: "#F6DCC7", shade: "#E3BFA5", lip: "#B5655A" },
  { id: "s2", base: "#EFC6A2", shade: "#DAA884", lip: "#A95A48" },
  { id: "s3", base: "#E0AE84", shade: "#C8926A", lip: "#97503A" },
  { id: "s4", base: "#C68B59", shade: "#AC7246", lip: "#7E3E22" },
  { id: "s5", base: "#A86E45", shade: "#8F5935", lip: "#6A321A" },
  { id: "s6", base: "#8A5634", shade: "#734428", lip: "#4E2412" },
  { id: "s7", base: "#6A3F24", shade: "#57321C", lip: "#3A1A0C" },
  { id: "s8", base: "#4E2D1A", shade: "#3F2414", lip: "#2A1208" },
] as const;

export const EYE_COLORS = [
  { id: "brown", label: "Brown", color: "#6B4423" },
  { id: "dark", label: "Dark brown", color: "#3A2416" },
  { id: "hazel", label: "Hazel", color: "#8A6A2E" },
  { id: "green", label: "Green", color: "#3F7D4E" },
  { id: "blue", label: "Blue", color: "#3B6EAD" },
  { id: "grey", label: "Grey", color: "#6E7C8A" },
] as const;

export const HAIR_COLORS = [
  { id: "black", label: "Black", color: "#1E1712", natural: true },
  { id: "dark-brown", label: "Dark brown", color: "#3B2416", natural: true },
  { id: "brown", label: "Brown", color: "#6B4226", natural: true },
  { id: "auburn", label: "Auburn", color: "#8A3B1E", natural: true },
  { id: "blonde", label: "Blonde", color: "#D2AC62", natural: true },
  { id: "platinum", label: "Platinum", color: "#E6DCC2", natural: true },
  { id: "grey", label: "Grey", color: "#9C9A96", natural: true },
  { id: "blue", label: "Blue", color: "#3B6FD8", natural: false },
  { id: "pink", label: "Pink", color: "#E07AA5", natural: false },
  { id: "green", label: "Green", color: "#2E9E6A", natural: false },
  { id: "purple", label: "Purple", color: "#7A4FC2", natural: false },
] as const;

// One cloth palette for everything worn: neutrals, then the rack's colours.
export const CLOTH = [
  { id: "white", label: "White", color: "#ECEAE4" },
  { id: "cream", label: "Cream", color: "#F2EAD8" },
  { id: "sky", label: "Sky", color: "#D5DFEA" },
  { id: "grey", label: "Grey", color: "#5B6470" },
  { id: "charcoal", label: "Charcoal", color: "#2F343B" },
  { id: "black", label: "Black", color: "#16171A" },
  { id: "navy", label: "Navy", color: "#1F2A44" },
  { id: "brown", label: "Brown", color: "#5A4632" },
  { id: "felt", label: "Felt", color: "#1F4D3A" },
  { id: "brass", label: "Brass", color: "#C9A96E" },
  { id: "yellow", label: "Yellow", color: "#F2C230" },
  { id: "blue", label: "Blue", color: "#1F4FB3" },
  { id: "red", label: "Red", color: "#D6362B" },
  { id: "purple", label: "Purple", color: "#5B2D8E" },
  { id: "orange", label: "Orange", color: "#EF7D1A" },
  { id: "green", label: "Green", color: "#1D8A46" },
  { id: "maroon", label: "Maroon", color: "#7A1F2B" },
] as const;

// The circle behind the character: mid tones that hold on the dark app and
// keep a face readable. The rack's colours are here, so the ball a member
// picked becomes their starter's background.
export const BACKDROPS = [
  { id: "gold", label: "Gold", color: "#B8902A" },
  { id: "blue", label: "Blue", color: "#2E5BB8" },
  { id: "red", label: "Red", color: "#B23A2E" },
  { id: "purple", label: "Purple", color: "#6440A0" },
  { id: "orange", label: "Orange", color: "#C8661C" },
  { id: "green", label: "Green", color: "#23864A" },
  { id: "maroon", label: "Maroon", color: "#7E2A36" },
  { id: "slate", label: "Slate", color: "#3D4450" },
  { id: "felt", label: "Felt", color: "#2A6B50" },
  { id: "teal", label: "Teal", color: "#227A80" },
  { id: "sky", label: "Sky", color: "#4A86C0" },
  { id: "rose", label: "Rose", color: "#B0577A" },
  { id: "sand", label: "Sand", color: "#A8875A" },
  { id: "night", label: "Night", color: "#22262D" },
] as const;

export type ClothId = (typeof CLOTH)[number]["id"];

export function clothColor(id: string): string {
  return CLOTH.find((c) => c.id === id)?.color ?? CLOTH[0].color;
}

export function backdropColor(id: string): string {
  return BACKDROPS.find((c) => c.id === id)?.color ?? BACKDROPS[7].color;
}

// ---------- parts ----------

// An earned part says how it is earned; everything without `earn` is free
// from day one.
export type Earn =
  | { kind: "title"; title: TitleName }
  | { kind: "cup" }
  | { kind: "season" }
  | { kind: "streak"; length: number }
  | { kind: "night" };

export interface Part {
  id: string;
  label: string;
  earn?: Earn;
}

const part = (xs: readonly Part[]) => xs;

export const FACES = part([
  { id: "round", label: "Round" },
  { id: "oval", label: "Oval" },
  { id: "soft", label: "Square" },
]);

// A whole expression: eyes, brows and mouth that belong together.
export const EXPRESSIONS = part([
  { id: "happy", label: "Happy" },
  { id: "beaming", label: "Beaming" },
  { id: "laughing", label: "Laughing" },
  { id: "calm", label: "Calm" },
  { id: "cool", label: "Cool" },
  { id: "cheeky", label: "Cheeky" },
  { id: "focused", label: "Focused" },
  { id: "surprised", label: "Surprised" },
]);

export const HAIRS = part([
  { id: "buzz", label: "Buzz" },
  { id: "crop", label: "Crop" },
  { id: "side-part", label: "Side part" },
  { id: "quiff", label: "Quiff" },
  { id: "curly", label: "Curls" },
  { id: "afro", label: "Afro" },
  { id: "waves", label: "Waves" },
  { id: "long", label: "Long" },
  { id: "bob", label: "Bob" },
  { id: "ponytail", label: "Ponytail" },
  { id: "bun", label: "Bun" },
  { id: "braids", label: "Braids" },
  { id: "locs", label: "Locs" },
  { id: "bald", label: "Bald" },
]);

export const FACIAL_HAIR = part([
  { id: "none", label: "None" },
  { id: "stubble", label: "Stubble" },
  { id: "mustache", label: "Mustache" },
  { id: "goatee", label: "Goatee" },
  { id: "beard", label: "Beard" },
]);

export const TOPS = part([
  { id: "shirt", label: "Dress shirt" },
  { id: "polo", label: "Polo" },
  { id: "tee", label: "Tee" },
  { id: "hoodie", label: "Hoodie" },
]);

export const LAYERS = part([
  { id: "vest", label: "Vest" },
  { id: "suspenders", label: "Suspenders" },
  { id: "none", label: "None" },
]);

export const NECKWEAR = part([
  { id: "bow", label: "Bow tie" },
  { id: "tie", label: "Tie" },
  { id: "none", label: "None" },
  { id: "flame-bow", label: "Flame bow tie", earn: { kind: "streak", length: 5 } },
]);

// The closet. Every outfit is a whole look, like Duolingo's; the club
// classic is the one you tailor piece by piece. The title outfits climb with
// the ladder; the cup jacket is won.
export const OUTFITS = part([
  { id: "classic", label: "Club classic" },
  { id: "varsity", label: "Varsity jacket" },
  { id: "hawaiian", label: "Island shirt" },
  { id: "denim", label: "Denim jacket" },
  { id: "track", label: "Track jacket" },
  { id: "bowling", label: "Bowling shirt", earn: { kind: "title", title: "Regular" } },
  { id: "leather", label: "Leather jacket", earn: { kind: "title", title: "Shark" } },
  { id: "pinstripe", label: "Pinstripe suit", earn: { kind: "title", title: "Hustler" } },
  { id: "tuxedo", label: "Tuxedo", earn: { kind: "title", title: "Master" } },
  { id: "legend", label: "Legend's white tux", earn: { kind: "title", title: "Legend" } },
  { id: "cup-jacket", label: "Cup winner's jacket", earn: { kind: "cup" } },
]);

// Costumes, like Duolingo's: dress-up from head to toe, each with its own
// headwear and props (a helmet, a cape, a hood), all free. A costume is worn
// in the outfit slot, so it replaces the outfit, and it takes off the
// member's hat (a headscarf stays on unless the costume has headwear).
export const COSTUMES = part([
  { id: "referee", label: "Referee" },
  { id: "astronaut", label: "Astronaut" },
  { id: "superhero", label: "Superhero" },
  { id: "wizard", label: "Wizard" },
  { id: "pirate", label: "Pirate" },
  { id: "cowboy", label: "Cowboy" },
  { id: "chef", label: "Chef" },
  { id: "graduate", label: "Graduate" },
  { id: "tiger", label: "Tiger onesie" },
  { id: "dino", label: "Dino onesie" },
]);

export const isCostume = (outfit: string) => COSTUMES.some((c) => c.id === outfit);

// Outfits and costumes that come in a colour of your choosing; the others
// have their own.
export const COLORED_OUTFITS = new Set(["varsity", "hawaiian", "track", "bowling", "superhero", "wizard"]);

export const HATS = part([
  { id: "none", label: "None" },
  { id: "flatcap", label: "Flat cap" },
  { id: "fedora", label: "Fedora" },
  { id: "beanie", label: "Beanie" },
  { id: "backcap", label: "Ball cap" },
  { id: "bucket", label: "Bucket hat" },
  { id: "headband", label: "Headband" },
  { id: "headscarf", label: "Headscarf" },
]);

export const EYEWEAR = part([
  { id: "none", label: "None" },
  { id: "round", label: "Round" },
  { id: "square", label: "Square" },
  { id: "shades", label: "Shades" },
]);

export const EARRINGS = part([
  { id: "none", label: "None" },
  { id: "stud", label: "Studs" },
  { id: "hoop", label: "Hoops" },
]);

// Gear stacks: any number at once.
export const GEAR = part([
  { id: "chain", label: "Chain" },
  { id: "headphones", label: "Headphones" },
  { id: "glove", label: "Billiard glove" },
  { id: "toothpick", label: "Toothpick" },
  { id: "pin", label: "Champion's pin", earn: { kind: "season" } },
  { id: "towel", label: "House-pro towel", earn: { kind: "night" } },
]);

// One cue per title badge; a member carries any cue they have reached.
export const CUES = part([
  { id: "house", label: "House cue", earn: { kind: "title", title: "Rookie" } },
  { id: "regular", label: "Regular's maple", earn: { kind: "title", title: "Regular" } },
  { id: "shark", label: "Shark's steel", earn: { kind: "title", title: "Shark" } },
  { id: "hustler", label: "Hustler's ebony", earn: { kind: "title", title: "Hustler" } },
  { id: "master", label: "Master's carbon", earn: { kind: "title", title: "Master" } },
  { id: "legend", label: "Legend's pearl", earn: { kind: "title", title: "Legend" } },
]);

// ---------- the look ----------

export interface Look {
  skin: string;
  face: string;
  eyeColor: string;
  expression: string;
  hair: string;
  hairColor: string;
  facialHair: string;
  facialHairColor: string;
  outfit: string;
  outfitColor: string;
  // The club classic's pieces.
  top: string;
  topColor: string;
  layer: string;
  layerColor: string;
  neck: string;
  neckColor: string;
  pants: string;
  hat: string;
  hatColor: string;
  eyewear: string;
  earrings: string;
  gear: string[];
  cue: string;
  bg: string;
}

// Every single-choice field and the ids it accepts.
const CHOICES: Record<Exclude<keyof Look, "gear">, readonly { id: string }[]> = {
  skin: SKINS,
  face: FACES,
  eyeColor: EYE_COLORS,
  expression: EXPRESSIONS,
  hair: HAIRS,
  hairColor: HAIR_COLORS,
  facialHair: FACIAL_HAIR,
  facialHairColor: HAIR_COLORS,
  outfit: [...OUTFITS, ...COSTUMES],
  outfitColor: CLOTH,
  top: TOPS,
  topColor: CLOTH,
  layer: LAYERS,
  layerColor: CLOTH,
  neck: NECKWEAR,
  neckColor: CLOTH,
  pants: CLOTH,
  hat: HATS,
  hatColor: CLOTH,
  eyewear: EYEWEAR,
  earrings: EARRINGS,
  cue: CUES,
  bg: BACKDROPS,
};

// The parts that carry an `earn`, keyed "field:id" (gear as "gear:id").
const EARNED: Map<string, Earn> = new Map(
  (
    [
      ["neck", NECKWEAR],
      ["outfit", OUTFITS],
      ["gear", GEAR],
      ["cue", CUES],
    ] as const
  ).flatMap(([field, parts]) => parts.filter((p) => p.earn).map((p) => [`${field}:${p.id}`, p.earn!] as const))
);

export function earnOf(field: keyof Look, id: string): Earn | undefined {
  return EARNED.get(`${field}:${id}`);
}

// ---------- progress and unlocks ----------

// What a member has done that earns parts. All of it is already in the app:
// the title from XP, cups and seasons won, the best win streak, club nights
// opened.
export interface Progress {
  title: TitleName;
  cupsWon: number;
  seasonsWon: number;
  bestStreak: number;
  nightsOpened: number;
}

export const NO_PROGRESS: Progress = { title: "Rookie", cupsWon: 0, seasonsWon: 0, bestStreak: 0, nightsOpened: 0 };

const titleRank = (t: TitleName) => TITLES.findIndex((x) => x.name === t);

export function isEarned(earn: Earn | undefined, p: Progress): boolean {
  if (!earn) return true;
  switch (earn.kind) {
    case "title":
      return titleRank(p.title) >= titleRank(earn.title);
    case "cup":
      return p.cupsWon > 0;
    case "season":
      return p.seasonsWon > 0;
    case "streak":
      return p.bestStreak >= earn.length;
    case "night":
      return p.nightsOpened > 0;
  }
}

// How to earn it, in the builder's words.
export function earnHint(earn: Earn): string {
  switch (earn.kind) {
    case "title": {
      const from = TITLES.find((t) => t.name === earn.title)?.from ?? 1;
      return `Reach ${earn.title} (level ${from})`;
    }
    case "cup":
      return "Win a cup";
    case "season":
      return "Win a season";
    case "streak":
      return `Win ${earn.length} in a row`;
    case "night":
      return "Open a club night";
  }
}

// The best cue a member has reached: the starter's cue, so a new title shows
// up on everyone's starter without them doing anything.
export function bestCue(p: Progress): string {
  let best: string = CUES[0].id;
  for (const c of CUES) if (isEarned(c.earn, p)) best = c.id;
  return best;
}

// ---------- the starter ----------

// A small seeded generator, so a member's starter is the same on every
// screen and every visit with nothing stored.
function seeded(id: string): () => number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let a = h || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(rng: () => number, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length) % xs.length];

// The ball a member already has becomes their circle, so the colour people
// know them by carries over (lib/identity BALLS: 1–7 solids, 8, 9–15 stripes).
const BALL_BACKDROP = ["gold", "blue", "red", "purple", "orange", "green", "maroon", "night"] as const;

export function ballBackdrop(ballNumber: number): string {
  const n = ballNumber >= 9 ? ballNumber - 8 : ballNumber;
  return BALL_BACKDROP[Math.min(Math.max(n, 1), 8) - 1];
}

// What a starter may draw from: the house kit. A starter says nothing about
// the person wearing it, because nobody chose it. Everyone gets the neutral
// chalk skin, the same dark eyes, and a club cap with no hair under it, so
// the app never assigns a skin tone, an eye colour or a hairstyle (owner,
// 2026-10-29). It varies only in what anyone might wear: the ball-colour
// backdrop, the cap, the shirt, vest and tie, and a friendly expression.
// Nothing a member might not choose (facial hair, earrings, shades, chain,
// toothpick, a headscarf), and nothing is guessed from a member's name.
export const STARTER = {
  expressions: ["happy", "beaming", "calm"],
  shirts: ["white", "cream", "sky"],
  vests: ["charcoal", "navy", "brown", "felt", "maroon", "grey", "black", "blue"],
  hats: ["flatcap", "beanie", "backcap", "bucket"],
  hatColors: ["charcoal", "navy", "brown", "felt", "maroon", "grey"],
} as const;

export function starterLook(id: string, ballNumber: number, progress: Progress = NO_PROGRESS): Look {
  const rng = seeded(id);
  const vest = pick(rng, STARTER.vests);
  // A bow or tie that stands out from the vest.
  const neckColor = pick(rng, (["black", "brass", "white", "red"] as const).filter((c) => c !== vest));
  return {
    skin: NEUTRAL_SKIN,
    face: pick(rng, FACES).id,
    eyeColor: "dark",
    expression: pick(rng, STARTER.expressions),
    // Under the cap; a member who takes it off picks their own hair.
    hair: "bald",
    hairColor: "dark-brown",
    facialHair: "none",
    facialHairColor: "dark-brown",
    outfit: "classic",
    outfitColor: "blue",
    top: "shirt",
    topColor: pick(rng, STARTER.shirts),
    layer: "vest",
    layerColor: vest,
    neck: rng() < 0.6 ? "bow" : "tie",
    neckColor,
    pants: "charcoal",
    hat: pick(rng, STARTER.hats),
    hatColor: pick(rng, STARTER.hatColors.filter((c) => c !== vest)),
    eyewear: rng() < 0.15 ? pick(rng, ["round", "square"] as const) : "none",
    earrings: "none",
    gear: [],
    cue: bestCue(progress),
    bg: ballBackdrop(ballNumber),
  };
}

// A fresh look for the builder's Randomize: anything free or earned, fun
// hair colours included, still always a friendly face.
export function randomLook(progress: Progress, rng: () => number = Math.random): Look {
  const open = (field: keyof Look, xs: readonly Part[]) => xs.filter((x) => isEarned(earnOf(field, x.id), progress));
  const cloth = () => pick(rng, CLOTH).id;
  const hairColor = pick(rng, HAIR_COLORS).id;
  return {
    skin: pick(rng, SKINS).id,
    face: pick(rng, FACES).id,
    eyeColor: pick(rng, EYE_COLORS).id,
    expression: pick(rng, EXPRESSIONS).id,
    hair: pick(rng, HAIRS).id,
    hairColor,
    facialHair: rng() < 0.4 ? pick(rng, FACIAL_HAIR).id : "none",
    facialHairColor: rng() < 0.8 ? hairColor : pick(rng, HAIR_COLORS).id,
    outfit:
      rng() < 0.25 ? pick(rng, COSTUMES).id : rng() < 0.45 ? pick(rng, open("outfit", OUTFITS)).id : "classic",
    outfitColor: cloth(),
    top: pick(rng, TOPS).id,
    topColor: cloth(),
    layer: pick(rng, LAYERS).id,
    layerColor: cloth(),
    neck: pick(rng, open("neck", NECKWEAR)).id,
    neckColor: cloth(),
    pants: pick(rng, ["charcoal", "black", "navy", "brown", "grey"] as const),
    hat: rng() < 0.45 ? pick(rng, HATS.filter((h) => h.id !== "none")).id : "none",
    hatColor: cloth(),
    eyewear: rng() < 0.3 ? pick(rng, EYEWEAR).id : "none",
    earrings: rng() < 0.3 ? pick(rng, EARRINGS).id : "none",
    gear: open("gear", GEAR)
      .filter(() => rng() < 0.2)
      .map((g) => g.id),
    cue: bestCue(progress),
    bg: pick(rng, BACKDROPS).id,
  };
}

// ---------- the guard ----------

// Any stored value back to a valid look: unknown fields and ids fall back to
// `base`, and a part the member hasn't earned (or no longer qualifies for in
// this build) is swapped for the base's.
export function sanitizeLook(raw: unknown, base: Look, progress: Progress): Look {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = { ...base, gear: [...base.gear] };
  for (const field of Object.keys(CHOICES) as (keyof typeof CHOICES)[]) {
    const v = src[field];
    if (typeof v !== "string") continue;
    if (!CHOICES[field].some((c) => c.id === v)) continue;
    if (!isEarned(earnOf(field, v), progress)) continue;
    out[field] = v;
  }
  if (Array.isArray(src.gear)) {
    out.gear = [
      ...new Set(
        src.gear.filter(
          (g): g is string =>
            typeof g === "string" && GEAR.some((x) => x.id === g) && isEarned(earnOf("gear", g), progress)
        )
      ),
    ];
  }
  return out;
}
