"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Lock, RotateCcw, Shirt, Shuffle, Smile, Star } from "lucide-react";
import { Character } from "@/components/character";
import { CharacterAvatar, useLookOf } from "@/components/character-face";
import { TitleBadge } from "@/components/title-badge";
import { Button } from "@/components/ui/button";
import {
  BACKDROPS,
  BODIES,
  BOTTOMS,
  CLOTH,
  COLORED_OUTFITS,
  COSTUMES,
  CUES,
  EARRINGS,
  EXPRESSIONS,
  EYE_COLORS,
  EYEWEAR,
  FACES,
  FACIAL_HAIR,
  GEAR,
  HAIRS,
  HAIR_COLORS,
  HATS,
  LASHES,
  LAYERS,
  LIPS,
  NEUTRAL_SKIN,
  NECKWEAR,
  OUTFITS,
  SKINS,
  TOPS,
  applyPreset,
  backdropColor,
  earnHint,
  earnOf,
  isCostume,
  isEarned,
  randomLook,
  sanitizeLook,
  starterLook,
  type Look,
  type Part,
  type Progress,
} from "@/lib/character";
import { TITLES } from "@/lib/levels";
import { cn } from "@/lib/utils";

type Field = Exclude<keyof Look, "gear">;
type Section = "avatar" | "closet";

// Each tile frames the part it changes.
const CROP = {
  face: "41 36 38 32",
  head: "28 8 64 64",
  body: "16 18 88 110",
  cue: "12 14 96 186",
  glove: "22 80 76 95",
  costume: "12 -8 96 120",
  mouth: "45 47 30 22",
  figure: "14 24 92 115",
  legs: "22 96 76 95",
} as const;

const SKIN_SWATCHES = SKINS.map((s, i) => ({
  id: s.id,
  label: s.id === NEUTRAL_SKIN ? "Chalk (neutral)" : `Tone ${i}`,
  color: s.base,
}));

// The builder, after Duolingo's: your character big on its backdrop, then two
// rooms. Avatar is you (skin, eyes, expression, hair, glasses, facial hair,
// headwear, backdrop), each style right after its colour; the Closet is what
// you wear (outfits, the club classic tailored piece by piece, your cue,
// gear). Every option is drawn on your own character. Earned parts show their
// lock and how to earn them. `onSave` stores the look (the server checks it
// again); without one (the preview page) Save stays off.
export function CharacterBuilder({
  memberId,
  ball,
  progress,
  onSave,
}: {
  memberId: string;
  ball: number;
  progress: Progress;
  onSave?: (look: Look) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const starter = useMemo(() => starterLook(memberId, ball, progress), [memberId, ball, progress]);
  const shared = useLookOf(memberId, ball, progress);
  const saved = useMemo(() => sanitizeLook(shared, starter, progress), [shared, starter, progress]);
  const [draft, setDraft] = useState<Look | null>(null);
  const [section, setSection] = useState<Section>("avatar");
  const [status, setStatus] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const look = draft ?? saved;
  const dirty = draft !== null && JSON.stringify(draft) !== JSON.stringify(saved);

  const set = (patch: Partial<Look>) => {
    setDraft({ ...look, ...patch });
    setStatus(null);
  };
  const tailor = (patch: Partial<Look>) => set({ ...patch, outfit: "classic" });
  const save = () => {
    if (!onSave) return;
    startSaving(async () => {
      const { error } = await onSave(look);
      if (error) {
        setStatus(error);
        return;
      }
      setDraft(null);
      setStatus("Saved. Everyone sees your new look.");
      router.refresh();
    });
  };
  const tile = { look, progress, set };

  return (
    <div className="flex flex-col gap-5">
      <section
        aria-label="Your character"
        className="relative flex flex-col items-center overflow-hidden rounded-[28px] pt-6"
        style={{
          backgroundColor: backdropColor(look.bg),
          backgroundImage:
            "radial-gradient(120% 90% at 30% 15%, rgba(255,255,255,0.2), transparent 60%), linear-gradient(to bottom, transparent 70%, rgba(0,0,0,0.25))",
        }}
      >
        <Character look={look} view="full" className="relative h-[250px] w-[150px]" label="Your character" />
        <div className="flex w-full items-center justify-between gap-3 bg-black/25 px-4 py-3 backdrop-blur-sm">
          <div role="group" aria-label="How it looks in the app" className="flex items-end gap-3">
            {[30, 40, 56].map((px) => (
              <span key={px} style={{ width: px, height: px }} className="block shrink-0">
                <CharacterAvatar look={look} className="size-full" circleStyle={{ boxShadow: "0 0 0 2px rgba(0,0,0,0.25)" }} />
              </span>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Button type="button" variant="secondary" size="icon" aria-label="Randomize" onClick={() => set(randomLook(progress))}>
              <Shuffle className="size-4" strokeWidth={1.8} />
            </Button>
            <Button type="button" variant="secondary" size="icon" aria-label="Back to your starter" onClick={() => set(starter)}>
              <RotateCcw className="size-4" strokeWidth={1.8} />
            </Button>
          </div>
        </div>
      </section>

      <div role="tablist" aria-label="Builder" className="bg-secondary grid grid-cols-2 gap-1 rounded-2xl p-1">
        {(
          [
            { id: "avatar", label: "Avatar", Icon: Smile },
            { id: "closet", label: "Closet", Icon: Shirt },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={cn(
              "flex h-11 items-center justify-center gap-2 rounded-xl text-[15px] font-medium transition-colors",
              section === id ? "bg-background text-foreground shadow-[0_0_0_1px_var(--hairline-strong)]" : "text-tab-inactive"
            )}
          >
            <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {section === "avatar" ? (
        <div role="tabpanel" aria-label="Avatar" className="flex flex-col gap-7">
          <QuickStart look={look} set={set} />
          <Swatches label="Skin tone" field="skin" options={SKIN_SWATCHES} {...tile} />
          <Group title="Body shape">
            <Tiles field="body" parts={BODIES} crop={CROP.figure} full tall {...tile} />
          </Group>
          <Group title="Face shape">
            <Tiles field="face" parts={FACES} crop={CROP.head} {...tile} />
          </Group>
          <Swatches label="Eye colour" field="eyeColor" options={EYE_COLORS} {...tile} />
          <Group title="Expression">
            <Tiles field="expression" parts={EXPRESSIONS} crop={CROP.face} {...tile} look={{ ...look, eyewear: "none" }} />
          </Group>
          <Group title="Eyelashes">
            <Tiles field="lashes" parts={LASHES} crop={CROP.face} {...tile} look={{ ...look, eyewear: "none" }} />
          </Group>
          <Group title="Lip colour">
            <Tiles field="lips" parts={LIPS} crop={CROP.mouth} {...tile} look={{ ...look, facialHair: "none" }} />
          </Group>
          <Swatches label="Hair colour" field="hairColor" options={HAIR_COLORS} {...tile} />
          <Group title="Hairstyle">
            <Tiles field="hair" parts={HAIRS} crop={CROP.head} {...tile} look={{ ...look, hat: "none" }} />
          </Group>
          <Group title="Glasses">
            <Tiles field="eyewear" parts={EYEWEAR} crop={CROP.head} {...tile} />
          </Group>
          <Swatches label="Facial hair colour" field="facialHairColor" options={HAIR_COLORS} {...tile} />
          <Group title="Facial hair">
            <Tiles field="facialHair" parts={FACIAL_HAIR} crop={CROP.head} {...tile} />
          </Group>
          <Swatches label="Headwear colour" field="hatColor" options={CLOTH} {...tile} />
          <Group title="Headwear" note={isCostume(look.outfit) ? "Hidden while you wear a costume (a headscarf stays on)." : undefined}>
            <Tiles field="hat" parts={HATS} crop={CROP.head} {...tile} look={isCostume(look.outfit) ? { ...look, outfit: "classic" } : look} />
          </Group>
          <Group title="Earrings">
            <Tiles field="earrings" parts={EARRINGS} crop={CROP.head} {...tile} look={{ ...look, hat: look.hat === "headscarf" ? "none" : look.hat }} />
          </Group>
          <Swatches label="Background" field="bg" options={BACKDROPS} {...tile} />
        </div>
      ) : (
        <div role="tabpanel" aria-label="Closet" className="flex flex-col gap-7">
          <Group title="Outfits" note="Each one is a whole look. Tailor the club classic piece by piece.">
            <Tiles field="outfit" parts={OUTFITS} crop={CROP.body} full tall {...tile} />
          </Group>
          <Group title="Costumes" note="Dress up head to toe. Three are yours now; the rest come with achievements.">
            <Tiles field="outfit" parts={COSTUMES} crop={CROP.costume} full tall {...tile} />
          </Group>
          {COLORED_OUTFITS.has(look.outfit) && (
            <Swatches label={isCostume(look.outfit) ? "Costume colour" : "Outfit colour"} field="outfitColor" options={CLOTH} {...tile} />
          )}
          {look.outfit === "classic" && (
            <div className="bg-card flex flex-col gap-6 rounded-3xl p-4 shadow-[0_0_0_1px_var(--hairline)]">
              <h3 className="text-[15px] font-medium">Tailor the club classic</h3>
              <Group title="Top">
                <Tiles field="top" parts={TOPS} crop={CROP.body} full tall {...tile} set={tailor} look={{ ...look, layer: "none", neck: "none" }} />
              </Group>
              <Swatches label="Top colour" field="topColor" options={CLOTH} {...tile} set={tailor} />
              <Group title="Layer">
                <Tiles field="layer" parts={LAYERS} crop={CROP.body} full tall {...tile} set={tailor} />
              </Group>
              {look.layer !== "none" && <Swatches label="Layer colour" field="layerColor" options={CLOTH} {...tile} set={tailor} />}
              <Group title="Neckwear">
                <Tiles field="neck" parts={NECKWEAR} crop={CROP.body} full tall {...tile} set={tailor} />
              </Group>
              {(look.neck === "bow" || look.neck === "tie") && (
                <Swatches label="Neckwear colour" field="neckColor" options={CLOTH} {...tile} set={tailor} />
              )}
            </div>
          )}
          <Group title="Bottoms" note={isCostume(look.outfit) ? "Your costume brings its own." : undefined}>
            <Tiles field="bottom" parts={BOTTOMS} crop={CROP.legs} full tall {...tile} look={isCostume(look.outfit) ? { ...look, outfit: "classic" } : look} />
          </Group>
          <Swatches label="Bottoms colour" field="pants" options={CLOTH} {...tile} />
          <Group title="Cue" note="A better cue with every title badge. You keep each one you reach.">
            <Tiles field="cue" parts={CUES} crop={CROP.cue} full tall {...tile} />
          </Group>
          <Group title="Gear" note="Wear as many as you like.">
            <GearTiles {...tile} />
          </Group>
          <Ladder progress={progress} />
        </div>
      )}

      <div className="bg-background/90 sticky bottom-[calc(env(safe-area-inset-bottom)+76px)] z-10 -mx-6 flex items-center justify-between gap-3 px-6 py-3 backdrop-blur">
        <p aria-live="polite" className="text-muted-foreground min-w-0 text-[12px] leading-snug">
          {status ?? (!onSave ? "Preview: nothing here is saved." : dirty ? "Unsaved changes" : "Everyone sees the character you save.")}
        </p>
        <Button type="button" onClick={save} disabled={!onSave || !dirty || saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

// Male / Female: a quick start that applies a matching bundle (lib/character
// applyPreset). Neither is picked until the member taps one, and every piece
// below stays theirs to change.
function QuickStart({ look, set }: { look: Look; set: (patch: Partial<Look>) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-[15px] font-medium">Start from</legend>
      <div role="radiogroup" aria-label="Start from" className="bg-secondary grid grid-cols-2 gap-1 rounded-2xl p-1">
        {(["male", "female"] as const).map((p) => {
          const on = look.preset === p;
          return (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => set(applyPreset(look, p))}
              className={cn(
                "h-11 rounded-xl text-[15px] font-medium transition-colors",
                on ? "bg-brass text-background" : "text-foreground"
              )}
            >
              {p === "male" ? "Male" : "Female"}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-[12px]">Sets your shape, lashes, hair and bottoms. Change any of them after.</p>
    </fieldset>
  );
}

function Group({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-[15px] font-medium">{title}</h3>
        {note && <p className="text-muted-foreground text-[12px]">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Tiles({
  field,
  parts,
  look,
  progress,
  set,
  crop,
  full = false,
  tall = false,
}: {
  field: Field;
  parts: readonly Part[];
  look: Look;
  progress: Progress;
  set: (patch: Partial<Look>) => void;
  crop: string;
  full?: boolean;
  tall?: boolean;
}) {
  const bg = backdropColor(look.bg);
  return (
    <div className={cn("grid gap-2.5", tall ? "grid-cols-3" : "grid-cols-4")}>
      {parts.map((p) => {
        const earn = earnOf(field, p.id);
        const open = isEarned(earn, progress);
        const selected = look[field] === p.id;
        return (
          <button
            key={p.id}
            type="button"
            aria-pressed={selected}
            aria-disabled={!open}
            aria-label={open ? p.label : `${p.label}, locked: ${earnHint(earn!)}`}
            onClick={() => open && set({ [field]: p.id } as Partial<Look>)}
            className={cn(
              "bg-secondary relative flex flex-col items-center gap-1.5 rounded-2xl p-1.5 pb-2 text-center transition-shadow",
              selected ? "shadow-[0_0_0_2.5px_var(--brass)]" : "shadow-[0_0_0_1px_var(--hairline)]",
              !open && "cursor-not-allowed"
            )}
          >
            <span
              className={cn("block w-full overflow-hidden rounded-xl", tall ? "aspect-[4/5]" : "aspect-square")}
              style={{ backgroundColor: open ? `color-mix(in srgb, ${bg} 55%, #16181B)` : "#1A1C20" }}
            >
              <Character
                look={{ ...look, [field]: p.id }}
                view={full ? "full" : "bust"}
                crop={crop}
                className={cn("block size-full", !open && "opacity-35 grayscale")}
              />
            </span>
            <span className="text-[11px] leading-tight">{p.label}</span>
            {!open && (
              <>
                <span className="text-muted-foreground text-[10px] leading-tight">{earnHint(earn!)}</span>
                <span className="bg-background absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full shadow-[0_0_0_1px_var(--hairline-strong)]">
                  <Lock className="size-3" strokeWidth={2} aria-hidden="true" />
                </span>
              </>
            )}
            {selected && (
              <span className="bg-brass text-background absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full">
                <Check className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function GearTiles({ look, progress, set }: { look: Look; progress: Progress; set: (patch: Partial<Look>) => void }) {
  const bg = backdropColor(look.bg);
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {GEAR.map((g) => {
        const earn = earnOf("gear", g.id);
        const open = isEarned(earn, progress);
        const on = look.gear.includes(g.id);
        const preview = { ...look, gear: on ? look.gear : [...look.gear, g.id] };
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={on}
            aria-disabled={!open}
            aria-label={open ? g.label : `${g.label}, locked: ${earnHint(earn!)}`}
            onClick={() => open && set({ gear: on ? look.gear.filter((x) => x !== g.id) : [...look.gear, g.id] })}
            className={cn(
              "bg-secondary relative flex flex-col items-center gap-1.5 rounded-2xl p-1.5 pb-2 text-center",
              on ? "shadow-[0_0_0_2.5px_var(--brass)]" : "shadow-[0_0_0_1px_var(--hairline)]",
              !open && "cursor-not-allowed"
            )}
          >
            <span
              className="block aspect-[4/5] w-full overflow-hidden rounded-xl"
              style={{ backgroundColor: open ? `color-mix(in srgb, ${bg} 55%, #16181B)` : "#1A1C20" }}
            >
              <Character
                look={preview}
                view="full"
                crop={g.id === "glove" ? CROP.glove : g.id === "toothpick" ? "34 30 50 50" : CROP.body}
                className={cn("block size-full", !open && "opacity-35 grayscale")}
              />
            </span>
            <span className="text-[11px] leading-tight">{g.label}</span>
            {!open && <span className="text-muted-foreground text-[10px] leading-tight">{earnHint(earn!)}</span>}
            {on && (
              <span className="bg-brass text-background absolute top-2.5 right-2.5 flex size-6 items-center justify-center rounded-full">
                <Check className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Swatches({
  label,
  field,
  options,
  look,
  set,
}: {
  label: string;
  field: Field;
  options: readonly { id: string; label: string; color: string }[];
  look: Look;
  progress?: Progress;
  set: (patch: Partial<Look>) => void;
}) {
  return (
    <fieldset className="flex flex-col">
      <legend className="mb-2 text-[15px] font-medium">{label}</legend>
      <div className="-mx-1.5 flex flex-wrap">
        {options.map((o) => {
          const selected = look[field] === o.id;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              aria-label={o.label}
              title={o.label}
              onClick={() => set({ [field]: o.id } as Partial<Look>)}
              className="flex size-12 items-center justify-center rounded-full"
            >
              <span
                className="block size-9 rounded-full"
                style={{
                  backgroundColor: o.color,
                  backgroundImage: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.28), transparent 60%)",
                  boxShadow: selected
                    ? "0 0 0 2.5px var(--background), 0 0 0 4.5px var(--brass)"
                    : "inset 0 -2px 0 rgba(0,0,0,0.2), 0 0 0 1px var(--hairline-strong)",
                }}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// What each title badge brings, and the four things only winning brings.
function Ladder({ progress }: { progress: Progress }) {
  const byTitle = TITLES.map((t) => ({
    ...t,
    open: isEarned({ kind: "title", title: t.name }, progress),
    parts: [...CUES, ...OUTFITS].filter((p) => p.earn?.kind === "title" && p.earn.title === t.name).map((p) => p.label),
  }));
  const special = [
    ...OUTFITS.filter((o) => o.earn && o.earn.kind !== "title"),
    ...COSTUMES.filter((c) => c.earn),
    ...NECKWEAR.filter((n) => n.earn),
    ...GEAR.filter((g) => g.earn),
  ];
  return (
    <section aria-labelledby="ladder-h" className="flex flex-col gap-3">
      <h3 id="ladder-h" className="text-[15px] font-medium">
        Unlock as you play
      </h3>
      <ol className="flex flex-col">
        {byTitle.map((t) => (
          <li key={t.name} className="border-hairline-row flex items-center gap-3 border-b py-2.5">
            <TitleBadge title={t.name} size={28} locked={!t.open} decorative />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[14px] font-medium">
                {t.name} <span className="text-muted-foreground font-normal">· level {t.from}</span>
              </span>
              <span className="text-muted-foreground truncate text-[12px]">{t.parts.join(" · ")}</span>
            </span>
            {t.open ? (
              <Check className="text-win size-4" strokeWidth={2} aria-label="Unlocked" />
            ) : (
              <Lock className="text-muted-foreground size-4" strokeWidth={1.8} aria-label="Locked" />
            )}
          </li>
        ))}
        {special.map((p) => {
          const open = isEarned(p.earn, progress);
          return (
            <li key={p.id} className="border-hairline-row flex items-center gap-3 border-b py-2.5 last:border-b-0">
              <span className="bg-secondary text-brass flex size-7 shrink-0 items-center justify-center rounded-full" aria-hidden="true">
                <Star className="size-3.5" strokeWidth={2} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[14px] font-medium">{p.label}</span>
                <span className="text-muted-foreground text-[12px]">{earnHint(p.earn!)}</span>
              </span>
              {open ? (
                <Check className="text-win size-4" strokeWidth={2} aria-label="Unlocked" />
              ) : (
                <Lock className="text-muted-foreground size-4" strokeWidth={1.8} aria-label="Locked" />
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
