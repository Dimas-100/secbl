"use client";

import { createContext, useContext } from "react";
import { Character, POP_ASPECT } from "@/components/character";
import { ALL_PROGRESS, backdropColor, sanitizeLook, starterLook, type Look, type Progress } from "@/lib/character";
import { cn } from "@/lib/utils";

// Every saved look in the club by member id, loaded once by the member shell
// (lib/character-data.ts loadLooks). Outside it (the preview page) nobody has
// one, and everyone draws their starter.
const LooksContext = createContext<Record<string, unknown>>({});

export function LooksProvider({ looks, children }: { looks: Record<string, unknown>; children: React.ReactNode }) {
  return <LooksContext.Provider value={looks}>{children}</LooksContext.Provider>;
}

// A saved look was checked against its owner's progress when the server
// stored it; drawing someone else's there is no progress to hand, so earned
// parts pass. Unknown ids still fall back to the starter's.
const ANY_PROGRESS = ALL_PROGRESS;

export function useHasSavedLook(id: string): boolean {
  return useContext(LooksContext)[id] != null;
}

// A member's look: what they saved, or their starter.
export function useLookOf(id: string, ball: number, progress?: Progress): Look {
  const saved = useContext(LooksContext)[id];
  const starter = starterLook(id, ball, progress);
  return saved ? sanitizeLook(saved, starter, ANY_PROGRESS) : starter;
}

// The avatar, Duolingo-style: the member's backdrop colour as the circle,
// head and shoulders inside it, the top of the head rising a little past the
// circle's edge. `className` sizes the circle; `circleStyle` carries the
// avatar's rings (components/avatar.tsx), so they hug the circle, not the head.
export function CharacterAvatar({
  look,
  className,
  circleStyle,
}: {
  look: Look;
  className?: string;
  circleStyle?: React.CSSProperties;
}) {
  return (
    <span className={cn("relative block", className)}>
      <span
        className="absolute inset-0 rounded-full"
        style={{
          backgroundColor: backdropColor(look.bg),
          backgroundImage: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.18), transparent 65%)",
          ...circleStyle,
        }}
      />
      <Character look={look} view="pop" className="absolute bottom-0 left-0 w-full" style={{ aspectRatio: POP_ASPECT }} />
    </span>
  );
}

// The round avatar's character. Decorative; the name sits beside it.
export function CharacterFace({
  id,
  ball,
  className,
  circleStyle,
}: {
  id: string;
  ball: number;
  className?: string;
  circleStyle?: React.CSSProperties;
}) {
  return <CharacterAvatar look={useLookOf(id, ball)} className={className} circleStyle={circleStyle} />;
}

// The whole figure, cue in hand, in front of their backdrop circle: the
// Profile's header.
export function CharacterStage({ look, label, className }: { look: Look; label: string; className?: string }) {
  return (
    <span className={cn("relative flex h-[232px] w-[200px] items-end justify-center", className)}>
      <span
        aria-hidden="true"
        className="absolute top-3 left-1/2 size-[168px] -translate-x-1/2 rounded-full"
        style={{
          backgroundColor: backdropColor(look.bg),
          backgroundImage: "radial-gradient(circle at 35% 30%, rgba(255,255,255,0.2), transparent 65%)",
        }}
      />
      <Character look={look} view="full" className="relative h-[224px] w-[134px]" label={label} />
    </span>
  );
}

// `progress` gives a starter the best cue its owner has reached.
export function CharacterFigure({
  id,
  ball,
  progress,
  label,
}: {
  id: string;
  ball: number;
  progress?: Progress;
  label: string;
}) {
  return <CharacterStage look={useLookOf(id, ball, progress)} label={label} />;
}
