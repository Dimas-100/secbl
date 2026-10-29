"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ChevronRight, X } from "lucide-react";
import { CharacterAvatar, useHasSavedLook, useLookOf } from "@/components/character-face";

const DISMISSED = "secbl:character-nudge-dismissed";
const EVENT = "secbl:character-nudge";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

function dismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED) === "1";
  } catch {
    return false;
  }
}

// Home's "make it yours" card, for a member still on their starter
// character. Gone once they save one, or when they wave it off (a per-device
// choice; it's only a nudge).
export function CharacterNudge({ meId, ball }: { meId: string; ball: number }) {
  const saved = useHasSavedLook(meId);
  const look = useLookOf(meId, ball);
  const hidden = useSyncExternalStore(subscribe, dismissed, () => true);
  if (saved || hidden) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED, "1");
    } catch {
      // Private mode: it just comes back next visit.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <section aria-label="Your character" className="bg-card relative flex items-center gap-4 rounded-3xl p-4 pr-3 shadow-[0_0_0_1px_var(--hairline)]">
      <span className="block size-14 shrink-0">
        <CharacterAvatar look={look} className="size-full" />
      </span>
      <Link href="/settings/character" className="press flex min-w-0 flex-1 items-center gap-2">
        <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="text-[15px] leading-tight font-medium">Make your character</span>
          <span className="text-muted-foreground text-[12px] leading-snug">
            Hair, outfits, costumes, your cue. It&apos;s you on every screen.
          </span>
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="text-muted-foreground flex size-11 shrink-0 items-center justify-center rounded-full"
      >
        <X className="size-4" strokeWidth={1.8} />
      </button>
    </section>
  );
}
