"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { ChevronRight, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Input } from "@/components/ui/input";
import { ScoreStepper } from "@/components/score-stepper";
import { SubmitButton } from "@/components/submit-button";
import {
  RACES,
  canDecrement,
  canIncrement,
  finished,
  formatLabel,
  needLine,
  raceProgress,
  raceSubmitState,
  startingScores,
  suggestedSpot,
  type RaceState,
  type Side,
} from "@/lib/race";
import { recentOpponents } from "@/lib/report-form";
import { cn } from "@/lib/utils";
import { reportMatch } from "./actions";
import { clearLiveGame, publishLiveGame } from "./live-actions";

const GAME_TYPES = [
  { value: "8ball", label: "8-ball" },
  { value: "9ball", label: "9-ball" },
  { value: "10ball", label: "10-ball" },
  { value: "other", label: "Other" },
] as const;

const DEFAULT_RACE = 5;
const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface OpponentOption {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  ball?: number | null;
  school: string | null;
  rating: number;
}

interface Draft {
  at: number;
  opponentId: string | null;
  game: string;
  raceTo: number | null;
  spot: number;
  spotTo: Side | null;
  you: number;
  them: number;
  date: string;
}

function freshDraft(today: string): Draft {
  return { at: Date.now(), opponentId: null, game: "8ball", raceTo: DEFAULT_RACE, spot: 0, spotTo: null, you: 0, them: 0, date: today };
}

// A draft younger than 12 hours whose opponent still exists; otherwise fresh.
function loadDraft(key: string, opponents: OpponentOption[], today: string): Draft {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const d = JSON.parse(raw) as Draft;
      if (Date.now() - d.at < DRAFT_MAX_AGE_MS && (d.opponentId === null || opponents.some((o) => o.id === d.opponentId))) {
        return { ...freshDraft(today), ...d, date: d.date || today };
      }
    }
  } catch {
    // Private mode or blocked storage.
  }
  return freshDraft(today);
}

// The live scoreboard. One screen, no keyboard: the people you actually
// play, game and race pills, a spot if the ratings call for one, two hero
// numbers on rails that fill toward the finish, and a narrated submit in a
// sticky footer. The draft survives a locked phone via localStorage.
export function ReportMatchForm({
  opponents,
  recentIds,
  today,
  meId,
  myRating,
}: {
  opponents: OpponentOption[];
  recentIds: string[];
  today: string;
  meId: string;
  myRating: number;
}) {
  const draftKey = `secbl:draft-game:${meId}`;
  // One state object for the board, lazily restored from the draft. This
  // component is loaded client-only (see page.tsx), so reading localStorage
  // in the initialiser is safe and there is no hydration mismatch.
  const [d, setD] = useState<Draft>(() => loadDraft(draftKey, opponents, today));
  const { opponentId, game, raceTo, spot, spotTo, you, them, date } = d;
  const patch = (next: Partial<Draft>) => setD((cur) => ({ ...cur, ...next, at: Date.now() }));
  const setYou = (v: number) => patch({ you: v });
  const setThem = (v: number) => patch({ them: v });
  const setDate = (v: string) => patch({ date: v });
  const setGame = (v: string) => patch({ game: v });
  const [editingDate, setEditingDate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const buzzed = useRef<Side | null>(null);

  // Mirror every change so a locked phone does not lose the race.
  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(d));
    } catch {
      // Private mode or blocked storage: the form still works, it just forgets.
    }
  }, [draftKey, d]);

  // Everyone on Home sees this table while an opponent is picked (spec §3).
  // Debounced so a run of taps is one write; a restored draft republishes.
  useEffect(() => {
    if (!opponentId) return;
    const timer = setTimeout(() => {
      void publishLiveGame({ opponentId, gameType: game, raceTo, spot, spotTo: spotTo === "you" ? "me" : spotTo, you, them });
    }, 600);
    return () => clearTimeout(timer);
  }, [opponentId, game, raceTo, spot, spotTo, you, them]);

  const selected = opponents.find((o) => o.id === opponentId) ?? null;
  let chips = recentOpponents(recentIds, opponents);
  // A search-picked opponent who isn't a regular still needs a visible,
  // selected avatar — swap them in front and keep four.
  if (selected && !chips.some((c) => c.id === selected.id)) {
    chips = [selected, ...chips].slice(0, 4);
  }
  const firstName = (o: OpponentOption | null) => (o ? o.display_name.split(" ")[0] : null);
  const first = firstName(selected) ?? "Them";

  const race: RaceState = { you, them, raceTo, spot, spotTo };
  const done = finished(race);
  const suggestion = selected && raceTo ? suggestedSpot(raceTo, myRating, selected.rating) : null;
  const isSuggested = suggestion !== null && suggestion.spot === spot && suggestion.to === spotTo;

  // Picking a new opponent or format restarts the board from the spot.
  function applyFormat(next: { opponent?: OpponentOption | null; raceTo?: number | null; spot?: number; spotTo?: Side | null }) {
    const opp = next.opponent === undefined ? selected : next.opponent;
    const r = next.raceTo === undefined ? raceTo : next.raceTo;
    let s = next.spot ?? spot;
    let to = next.spotTo === undefined ? spotTo : next.spotTo;
    if (next.opponent !== undefined || next.raceTo !== undefined) {
      const sug = opp && r ? suggestedSpot(r, myRating, opp.rating) : { spot: 0, to: null };
      s = sug.spot;
      to = sug.to;
    }
    if (!r) {
      s = 0;
      to = null;
    }
    if (s === 0) to = null;
    if (s > 0 && !to) to = "them";
    if (r && s >= r) s = r - 1;
    const start = startingScores(r, s, to);
    patch({
      opponentId: next.opponent === undefined ? opponentId : (next.opponent?.id ?? null),
      raceTo: r,
      spot: s,
      spotTo: to,
      you: start.you,
      them: start.them,
    });
    buzzed.current = null;
  }

  function pickOpponent(o: OpponentOption) {
    applyFormat({ opponent: o });
  }

  function clearBoard() {
    setEditingDate(false);
    setD(freshDraft(today));
    buzzed.current = null;
    void clearLiveGame();
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }

  // The finish: a short buzz, once per finish, unless motion is reduced.
  useEffect(() => {
    if (!done) {
      buzzed.current = null;
      return;
    }
    if (buzzed.current === done) return;
    buzzed.current = done;
    if (typeof window === "undefined" || !("vibrate" in navigator)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate?.(done === "you" ? [30, 40, 30] : [60]);
  }, [done]);

  const s = raceSubmitState(race, firstName(selected));
  const line = needLine(race, first);
  const lineTone = done === "you" ? "text-win" : done === "them" ? "text-loss" : "text-muted-foreground";
  const openLine = !raceTo
    ? you === 0 && them === 0
      ? { text: "Enter the score", tone: "text-muted-foreground" }
      : you === them
        ? { text: "Scores can't be equal", tone: "text-muted-foreground" }
        : you > them
          ? { text: `Win ${you}–${them}`, tone: "text-win" }
          : { text: `Loss ${you}–${them}`, tone: "text-loss" }
    : null;
  const leader: Side | null = raceTo ? (you > them ? "you" : them > you ? "them" : null) : null;
  const spotLabel = formatLabel(raceTo, spot, spotTo === "you" ? "you" : spotTo === "them" ? first : null);
  const filtered = opponents.filter((o) => o.display_name.toLowerCase().includes(query.trim().toLowerCase()));

  return (
    <form
      action={reportMatch}
      onSubmit={() => {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
      }}
      className="flex flex-col gap-8 pb-36"
    >
      <section className="flex flex-col gap-3.5">
        <span className="eyebrow">Opponent</span>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="bg-card text-muted-foreground flex h-12 items-center gap-2.5 rounded-full px-4 text-left text-[15px] shadow-[inset_0_0_0_1px_var(--hairline-row)]"
        >
          <Search className="size-[17px] shrink-0" strokeWidth={1.7} />
          <span className={cn("truncate", selected && "text-foreground")}>
            {selected ? selected.display_name : "Search players"}
          </span>
        </button>
        <div className="grid grid-cols-4 gap-2">
          {chips.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => pickOpponent(o)}
              aria-pressed={o.id === opponentId}
              className={cn(
                "press flex min-w-0 flex-col items-center gap-2 py-1 text-[12px] font-medium",
                o.id === opponentId ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Avatar person={o} size="xl" selected={o.id === opponentId} />
              <span className="max-w-full truncate">{firstName(o)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3.5">
        <span className="eyebrow">Game</span>
        <div className="bg-card grid grid-cols-4 gap-1 rounded-full p-1">
          {GAME_TYPES.map((g) => (
            <label
              key={g.value}
              className="text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground flex h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium has-checked:font-semibold"
            >
              <input
                type="radio"
                name="game_type"
                value={g.value}
                checked={game === g.value}
                onChange={() => setGame(g.value)}
                className="sr-only"
              />
              {g.label}
            </label>
          ))}
        </div>
        <span className="eyebrow mt-1">Race to</span>
        <div className="bg-card grid grid-cols-5 gap-1 rounded-full p-1">
          {[...RACES, null].map((r) => (
            <label
              key={r ?? "open"}
              className="text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground flex h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium has-checked:font-semibold"
            >
              <input
                type="radio"
                name="race_pick"
                value={r ?? ""}
                aria-label={r ? `Race to ${r}` : "Open play"}
                checked={raceTo === r}
                onChange={() => applyFormat({ raceTo: r })}
                className="sr-only"
              />
              {r ?? "Open"}
            </label>
          ))}
        </div>
      </section>

      {selected && raceTo && (
        <section className="border-hairline-divider flex flex-col border-y">
          <div className="flex items-center gap-3 py-3">
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-medium">Games on the wire</span>
              <span className="text-muted-foreground text-[12px]">
                {spot > 0 ? spotLabel : "Even race"}
                {isSuggested && suggestion.spot > 0 && " · suggested from your ratings"}
              </span>
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Fewer games on the wire"
                disabled={spot === 0}
                onClick={() => applyFormat({ spot: spot - 1 })}
                className="press flex size-9 items-center justify-center rounded-full text-lg font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40"
              >
                −
              </button>
              <span className="stat-number w-5 text-center text-[17px]">{spot}</span>
              <button
                type="button"
                aria-label="More games on the wire"
                disabled={spot >= raceTo - 1}
                onClick={() => applyFormat({ spot: spot + 1, spotTo: spotTo ?? (suggestion?.to ?? "them") })}
                className="press flex size-9 items-center justify-center rounded-full text-lg shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40"
              >
                +
              </button>
            </span>
          </div>
          {spot > 0 && (
            <div className="bg-card mb-3 grid grid-cols-2 gap-1 self-start rounded-full p-1">
              {(["them", "you"] as Side[]).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={spotTo === side}
                  onClick={() => applyFormat({ spotTo: side })}
                  className={cn(
                    "h-8 rounded-full px-3 text-[12px] font-medium",
                    spotTo === side ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  )}
                >
                  {side === "you" ? "to you" : `to ${first}`}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col gap-[18px]">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Score</span>
          {(opponentId || you > 0 || them > 0) && (
            <button type="button" onClick={clearBoard} className="text-muted-foreground press text-[12px]">
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-start">
          <ScoreStepper
            label="You"
            value={you}
            onChange={setYou}
            canIncrement={canIncrement(race, "you")}
            canDecrement={canDecrement(race, "you")}
            progress={raceTo ? raceProgress(you, raceTo) : undefined}
            tone={leader === "you" ? "lead" : null}
            effect={done === "you" ? "win" : done === "them" ? "loss" : null}
          />
          <span aria-hidden="true" className="bg-hairline-divider h-[120px] w-px self-center" />
          <ScoreStepper
            label={first}
            value={them}
            onChange={setThem}
            canIncrement={canIncrement(race, "them")}
            canDecrement={canDecrement(race, "them")}
            progress={raceTo ? raceProgress(them, raceTo) : undefined}
            tone={leader === "them" ? "lead" : null}
            effect={done === "them" ? "win" : done === "you" ? "loss" : null}
          />
        </div>
        <p aria-live="polite" className={cn("stat-number text-center text-[13px]", openLine ? openLine.tone : lineTone)}>
          {openLine ? openLine.text : line}
        </p>
      </section>

      <section className="border-hairline-divider flex flex-col border-t">
        {editingDate ? (
          <div className="border-hairline-divider flex items-center gap-3 border-b py-3">
            <span className="flex-1 text-[15px] font-medium">When</span>
            <Input
              type="date"
              name="played_at"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              aria-label="Date played"
              className="h-10 w-auto"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditingDate(true)}
            className="border-hairline-divider flex items-center gap-3 border-b py-4 text-left"
          >
            <span className="flex-1 text-[15px] font-medium">When</span>
            <span className="text-muted-foreground text-[14px]">{date === today ? "Today" : date}</span>
            <ChevronRight className="text-muted-foreground size-4" strokeWidth={1.7} />
          </button>
        )}
      </section>

      {opponentId && <input type="hidden" name="opponent_id" value={opponentId} />}
      <input type="hidden" name="my_score" value={you} />
      <input type="hidden" name="their_score" value={them} />
      <input type="hidden" name="race_to" value={raceTo ?? ""} />
      <input type="hidden" name="spot" value={spot} />
      <input type="hidden" name="spot_to" value={spotTo === "you" ? "me" : spotTo === "them" ? "them" : ""} />
      {!editingDate && <input type="hidden" name="played_at" value={date} />}

      <div className="bg-background border-hairline fixed inset-x-0 bottom-0 z-10 border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <SubmitButton size="xl" className="w-full" disabled={s.disabled} pendingChildren="Sending…">
            {s.label}
          </SubmitButton>
          <p className="text-muted-foreground text-center text-[12px]">
            {s.reason ?? `Results post once ${firstName(selected) ?? "your opponent"} confirms.`}
          </p>
        </div>
      </div>

      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-3 rounded-t-[24px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <Dialog.Title className="text-[17px] font-semibold tracking-[-0.01em]">Pick opponent</Dialog.Title>
            <Input
              autoFocus
              placeholder="Search members"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search members"
            />
            <div className="flex flex-col overflow-y-auto overscroll-contain">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    pickOpponent(o);
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className="press border-hairline-row flex min-h-14 items-center justify-between gap-2 border-b text-left text-[15px] font-medium"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <Avatar person={o} size="sm" />
                    <span className="truncate">{o.display_name}</span>
                  </span>
                  {o.school && <span className="text-muted-foreground shrink-0 text-[12px]">{o.school}</span>}
                </button>
              ))}
              {filtered.length === 0 && <p className="text-muted-foreground p-2 text-sm">No members match.</p>}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}
