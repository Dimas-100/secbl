"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChevronRight, Plus, Search } from "lucide-react";
import { joinLine } from "@/app/(member)/night/actions";
import { loadPlaySheet, type PlayNight, type PlaySheetData } from "@/app/(member)/play/actions";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { resumableDraft, resumeLine, type ResumableDraft } from "@/lib/play";
import { draftKey } from "@/lib/report-form";

const SKELETON_FACES = 3;
const CARD = "bg-card rounded-[20px] shadow-[inset_0_0_0_1px_var(--hairline-row)]";

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// The last sheet data, per member, kept outside the component: the tab bar
// unmounts on the scoreboard, so state alone would lose it after every game
// and the next open would start from the skeleton again.
const lastData = new Map<string, PlaySheetData>();

// The tab bar's Play button and its sheet (spec 2026-10-21-play-and-progress
// §1): the game in progress, tonight's club night, and the people you play.
// Its data is fetched on open, so no page's server render pays for it; the
// last result stays, so a reopen shows at once while it refreshes.
export function PlaySheet({ meId }: { meId: string }) {
  const pathname = usePathname();
  // Open only on the page it was opened on, so any navigation closes it (a
  // face, Get in line's redirect to /night): the tab bar persists across
  // pages, and plain open state would follow the member to the next one.
  // Leaving the page also forgets it, so going Back does not reopen it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  if (openOn !== null && openOn !== pathname) setOpenOn(null);
  const open = openOn === pathname;
  const [draft, setDraft] = useState<ResumableDraft | null>(null);
  const [data, setData] = useState<PlaySheetData | null>(() => lastData.get(meId) ?? null);
  const [failed, setFailed] = useState(false);
  const [, startLoading] = useTransition();
  const content = useRef<HTMLDivElement>(null);
  // The path the sheet opened on, and whether one of its links or forms is
  // taking the member somewhere: after a navigation, focus is left to the
  // new page instead of jumping back to the Play button in the tab bar.
  const openedOn = useRef<string | null>(null);
  const leaving = useRef(false);
  const nightHeading = useId();
  const facesHeading = useId();

  // Actions run one at a time per client, so the newest call settles last
  // and its outcome (data or failure) is the one that stays.
  function load(d: ResumableDraft | null) {
    setFailed(false);
    startLoading(async () => {
      try {
        const next = await loadPlaySheet(d?.opponentId ?? null);
        lastData.set(meId, next);
        startLoading(() => {
          setData(next);
          setFailed(false);
        });
      } catch (err) {
        // The retry button is the member's way out; the cause is for us.
        console.warn("Play sheet: couldn't load", err);
        startLoading(() => setFailed(true));
      }
    });
  }

  function onOpenChange(next: boolean) {
    if (!next) {
      setOpenOn(null);
      return;
    }
    setOpenOn(pathname);
    openedOn.current = pathname;
    leaving.current = false;
    let d: ResumableDraft | null = null;
    try {
      d = resumableDraft(localStorage.getItem(draftKey(meId)), new Date().getTime());
    } catch {
      // Private mode or blocked storage: no game to go back to.
    }
    setDraft(d);
    load(d);
  }

  const close = () => setOpenOn(null);
  const shown = failed ? null : data;
  const resume = shown?.resume && draft && shown.resume.id === draft.opponentId ? shown.resume : null;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="press bg-brass text-background -mt-1.5 flex size-[50px] flex-col items-center justify-center gap-0.5 rounded-full text-[10px] font-semibold tracking-[0.04em]"
        >
          <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.2} />
          Play
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
        <Dialog.Content
          ref={content}
          aria-describedby={undefined}
          // Focus the sheet itself, not its first control: the title is read
          // out and Enter cannot join a line by accident.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            content.current?.focus();
          }}
          // Escape or a tap outside returns focus to the Play button; a close
          // caused by navigating (a link, Get in line's redirect, Back) leaves
          // it to the new page.
          onCloseAutoFocus={(e) => {
            if (leaving.current || window.location.pathname !== openedOn.current) e.preventDefault();
          }}
          // A link to the page already open (/night from /night) changes no
          // pathname, so every link tap closes the sheet explicitly too.
          onClick={(e) => {
            if ((e.target as Element).closest("a")) {
              leaving.current = true;
              close();
            }
          }}
          onSubmit={() => {
            leaving.current = true;
          }}
          className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[85vh] flex-col overflow-y-auto overscroll-contain rounded-t-[24px] px-4 pt-2.5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] outline-none"
        >
          <span aria-hidden="true" className="bg-hairline-ghost mx-auto mb-4 h-1 w-9 shrink-0 rounded-full" />
          <Dialog.Title className="mb-5 text-[17px] font-semibold tracking-[-0.01em]">Play</Dialog.Title>
          <div className="flex flex-col gap-6">
            {resume && draft && (
              <div className={CARD}>
                <ListRow
                  href="/matches/new"
                  className="border-b-0 px-4"
                  leading={<Avatar person={resume} size="md" />}
                  title="Back to your game"
                  meta={resumeLine(draft, resume.display_name)}
                  trailing={<ChevronRight aria-hidden="true" className="text-muted-foreground size-4" strokeWidth={1.7} />}
                />
              </div>
            )}

            {failed && (
              <Button variant="ghost" size="lg" className="w-full" onClick={() => load(draft)}>
                Couldn&apos;t load. Try again.
              </Button>
            )}

            {shown && (
              <section aria-labelledby={nightHeading} className="flex flex-col gap-3">
                <h3 id={nightHeading} className="eyebrow flex items-center gap-2">
                  {shown.night.kind !== "none" && (
                    <span aria-hidden="true" className="bg-win size-2 rounded-full motion-safe:animate-pulse" />
                  )}
                  Club night
                </h3>
                {shown.night.kind === "none" ? (
                  <div className={CARD}>
                    <ListRow
                      href="/night"
                      className="border-b-0 px-4"
                      title="Start club night"
                      meta="Open a line for the tables"
                      trailing={<ChevronRight aria-hidden="true" className="text-muted-foreground size-4" strokeWidth={1.7} />}
                    />
                  </div>
                ) : (
                  <div className={`${CARD} flex flex-col gap-3.5 p-4`}>
                    <p className="text-[15px] leading-snug font-medium">{shown.night.line}</p>
                    <NightAction night={shown.night} onSamePage={pathname === "/night" ? close : undefined} />
                  </div>
                )}
              </section>
            )}

            <section aria-labelledby={facesHeading} aria-busy={!data && !failed} className="flex flex-col gap-3">
              <h3 id={facesHeading} className="eyebrow">
                Play someone now
              </h3>
              <ul className="grid grid-cols-5 gap-2">
                {!data && !failed
                  ? Array.from({ length: SKELETON_FACES }, (_, i) => (
                      <li key={i} aria-hidden="true" className="flex flex-col items-center gap-2">
                        <span className="bg-card size-12 rounded-full motion-safe:animate-pulse" />
                        <span className="bg-card h-3 w-9 rounded motion-safe:animate-pulse" />
                      </li>
                    ))
                  : (shown?.faces ?? []).map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/matches/new?opponent=${p.id}`}
                          aria-label={p.display_name}
                          className="press flex flex-col items-center gap-2"
                        >
                          <Avatar person={p} size="lg" />
                          <span className="w-full truncate text-center text-[12px] font-medium">
                            {firstName(p.display_name)}
                          </span>
                        </Link>
                      </li>
                    ))}
                <li>
                  <Link href="/matches/new?find=1" className="press flex flex-col items-center gap-2">
                    <span className="flex size-12 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)]">
                      <Search aria-hidden="true" className="text-muted-foreground size-[18px]" strokeWidth={1.8} />
                    </span>
                    <span className="text-muted-foreground text-[12px] font-medium">Other</span>
                  </Link>
                </li>
              </ul>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// NightCard's one action, from the sheet (its status line sits above it).
// Get in line returns to /night; from /night itself that redirect changes no
// pathname, so the sheet is closed on submit there.
function NightAction({ night, onSamePage }: { night: PlayNight; onSamePage?: () => void }) {
  if (night.kind === "out") {
    return (
      <form action={joinLine} onSubmit={onSamePage}>
        <input type="hidden" name="night_id" value={night.nightId ?? ""} />
        <input type="hidden" name="back" value="/night" />
        <SubmitButton size="lg" className="w-full" pendingChildren="Joining…">
          Get in line
        </SubmitButton>
      </form>
    );
  }
  if (night.kind === "waiting") {
    return (
      <Button asChild size="lg" variant="ghost" className="w-full">
        <Link href="/night">Open club night</Link>
      </Button>
    );
  }
  if (night.kind === "playing" && night.opponentId) {
    return night.keepsScore ? (
      <Button asChild size="lg" className="w-full">
        <Link href={`/matches/new?opponent=${night.opponentId}`}>Start game</Link>
      </Button>
    ) : (
      <Button asChild size="lg" variant="ghost" className="w-full">
        <Link href={`/live/${night.opponentId}`}>Watch the table</Link>
      </Button>
    );
  }
  return null;
}
