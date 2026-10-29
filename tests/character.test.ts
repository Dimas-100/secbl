import { describe, expect, it } from "vitest";
import {
  CUES,
  HAIR_COLORS,
  NEUTRAL_SKIN,
  NO_PROGRESS,
  STARTER,
  ballBackdrop,
  bestCue,
  earnHint,
  earnOf,
  isEarned,
  randomLook,
  sanitizeLook,
  starterLook,
  type Progress,
} from "@/lib/character";

const ids = Array.from({ length: 300 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
const at = (title: Progress["title"], extra: Partial<Progress> = {}): Progress => ({ ...NO_PROGRESS, title, ...extra });

describe("starter characters", () => {
  it("are the same for a member on every call", () => {
    for (const id of ids.slice(0, 20)) expect(starterLook(id, 3)).toEqual(starterLook(id, 3));
  });

  it("differ from member to member", () => {
    const looks = new Set(ids.map((id) => JSON.stringify(starterLook(id, 1))));
    expect(looks.size).toBeGreaterThan(250);
  });

  it("stand on the member's ball colour", () => {
    expect(starterLook(ids[0], 2).bg).toBe("blue");
    expect(starterLook(ids[0], 10).bg).toBe("blue");
    expect(starterLook(ids[0], 8).bg).toBe("night");
    expect(ballBackdrop(15)).toBe("maroon");
  });

  it("vary their vests and shirts", () => {
    const vests = new Set(ids.map((id) => starterLook(id, 1).layerColor));
    const shirts = new Set(ids.map((id) => starterLook(id, 1).topColor));
    expect(vests.size).toBe(STARTER.vests.length);
    expect(shirts.size).toBe(STARTER.shirts.length);
  });

  it("never assign a skin tone, eye colour or hairstyle: chalk skin, dark eyes, a cap over no hair", () => {
    const natural = new Set<string>(HAIR_COLORS.filter((h) => h.natural).map((h) => h.id));
    for (const id of ids) {
      const l = starterLook(id, 5);
      expect(l.skin).toBe(NEUTRAL_SKIN);
      expect(l.eyeColor).toBe("dark");
      expect(l.hair).toBe("bald");
      expect(STARTER.hats as readonly string[]).toContain(l.hat);
      expect(natural.has(l.hairColor)).toBe(true);
    }
  });

  it("stay plain and kind: a friendly face, nothing a member might not pick", () => {
    for (const id of ids) {
      const l = starterLook(id, 5);
      expect(STARTER.expressions as readonly string[]).toContain(l.expression);
      expect(l.facialHair).toBe("none");
      expect(l.earrings).toBe("none");
      expect(l.gear).toEqual([]);
      expect(l.outfit).toBe("classic");
      expect(["none", "round", "square"] as string[]).toContain(l.eyewear);
    }
  });

  it("vary in what anyone might wear", () => {
    const caps = new Set(ids.map((id) => `${starterLook(id, 1).hat}/${starterLook(id, 1).hatColor}`));
    expect(caps.size).toBeGreaterThanOrEqual(STARTER.hats.length * (STARTER.hatColors.length - 1));
  });

  it("never take a headscarf or shades by default", () => {
    for (const id of ids) {
      const l = starterLook(id, 7);
      expect(l.hat).not.toBe("headscarf");
      expect(l.eyewear).not.toBe("shades");
    }
  });

  it("pick a bow or tie that stands out from the vest", () => {
    for (const id of ids) {
      const l = starterLook(id, 8);
      expect(l.neckColor).not.toBe(l.layerColor);
    }
  });

  it("carry the best cue the member has reached", () => {
    expect(starterLook(ids[0], 1).cue).toBe("house");
    expect(starterLook(ids[0], 1, at("Shark")).cue).toBe("shark");
    expect(starterLook(ids[0], 1, at("Legend")).cue).toBe("legend");
  });
});

describe("unlocks", () => {
  it("open a title's cue at that title and keep every lower one", () => {
    const shark = at("Shark");
    expect(CUES.filter((c) => isEarned(c.earn, shark)).map((c) => c.id)).toEqual(["house", "regular", "shark"]);
    expect(bestCue(at("Master"))).toBe("master");
  });

  it("gate the won parts on what the member actually did", () => {
    expect(isEarned(earnOf("outfit", "cup-jacket"), NO_PROGRESS)).toBe(false);
    expect(isEarned(earnOf("outfit", "cup-jacket"), at("Rookie", { cupsWon: 1 }))).toBe(true);
    expect(isEarned(earnOf("gear", "pin"), at("Rookie", { seasonsWon: 1 }))).toBe(true);
    expect(isEarned(earnOf("neck", "flame-bow"), at("Rookie", { bestStreak: 4 }))).toBe(false);
    expect(isEarned(earnOf("neck", "flame-bow"), at("Rookie", { bestStreak: 5 }))).toBe(true);
    expect(isEarned(earnOf("gear", "towel"), at("Rookie", { nightsOpened: 1 }))).toBe(true);
    expect(isEarned(earnOf("outfit", "tuxedo"), at("Hustler"))).toBe(false);
    expect(isEarned(earnOf("outfit", "tuxedo"), at("Master"))).toBe(true);
  });

  it("leave everything else free", () => {
    expect(earnOf("outfit", "varsity")).toBeUndefined();
    expect(earnOf("hair", "afro")).toBeUndefined();
    expect(earnOf("gear", "chain")).toBeUndefined();
  });

  it("say how to earn each locked part", () => {
    expect(earnHint({ kind: "title", title: "Shark" })).toBe("Reach Shark (level 10)");
    expect(earnHint({ kind: "streak", length: 5 })).toBe("Win 5 in a row");
    expect(earnHint({ kind: "cup" })).toBe("Win a cup");
  });

  it("randomize only into parts the member has", () => {
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 300; i++) {
      const l = randomLook(NO_PROGRESS, rng);
      expect(l.cue).toBe("house");
      expect(["bowling", "leather", "pinstripe", "tuxedo", "legend", "cup-jacket"]).not.toContain(l.outfit);
      expect(l.neck).not.toBe("flame-bow");
      expect(l.gear).not.toContain("pin");
      expect(l.gear).not.toContain("towel");
    }
  });
});

describe("a stored look", () => {
  const base = starterLook(ids[1], 4);

  it("keeps every valid choice", () => {
    const want = { ...base, hair: "afro", hairColor: "pink", hat: "fedora", gear: ["chain", "glove"] };
    expect(sanitizeLook(want, base, NO_PROGRESS)).toEqual(want);
  });

  it("drops unknown fields, unknown ids and junk", () => {
    const got = sanitizeLook({ hair: "mohawk", skin: 7, extra: "x", gear: ["chain", "jetpack", 3, "chain"] }, base, NO_PROGRESS);
    expect(got.hair).toBe(base.hair);
    expect(got.skin).toBe(base.skin);
    expect(got.gear).toEqual(["chain"]);
    expect(got).not.toHaveProperty("extra");
    expect(sanitizeLook("nonsense", base, NO_PROGRESS)).toEqual(base);
    expect(sanitizeLook(null, base, NO_PROGRESS)).toEqual(base);
  });

  it("swaps out a part the member hasn't earned", () => {
    const got = sanitizeLook({ outfit: "legend", cue: "legend", gear: ["pin", "chain"] }, base, at("Shark"));
    expect(got.outfit).toBe(base.outfit);
    expect(got.cue).toBe(base.cue);
    expect(got.gear).toEqual(["chain"]);
  });
});

describe("the switch", () => {
  it("turns characters on only when asked, and keeps the preview page out of production", async () => {
    const { vi } = await import("vitest");
    const { charactersEnabled, characterPreviewEnabled } = await import("@/lib/character");
    vi.stubEnv("NEXT_PUBLIC_CHARACTERS", "");
    expect(charactersEnabled()).toBe(false);
    expect(characterPreviewEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_CHARACTERS", "1");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    expect(charactersEnabled()).toBe(true);
    expect(characterPreviewEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    expect(charactersEnabled()).toBe(true);
    expect(characterPreviewEnabled()).toBe(false);
    vi.unstubAllEnvs();
  });
});

describe("costumes", () => {
  it("are free and fit in the outfit slot", async () => {
    const { COSTUMES, isCostume } = await import("@/lib/character");
    const base = starterLook(ids[2], 6);
    for (const c of COSTUMES) {
      expect(earnOf("outfit", c.id)).toBeUndefined();
      expect(isCostume(c.id)).toBe(true);
      expect(sanitizeLook({ outfit: c.id }, base, NO_PROGRESS).outfit).toBe(c.id);
    }
    expect(isCostume("classic")).toBe(false);
  });

  it("never dress a starter", async () => {
    const { isCostume } = await import("@/lib/character");
    for (const id of ids) expect(isCostume(starterLook(id, 4).outfit)).toBe(false);
  });
});
