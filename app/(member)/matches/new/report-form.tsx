"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { ChevronRight, MessageCircle, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { BackButton } from "@/components/nav-history";
import { TableTalk, useLiveComments } from "@/components/table-talk";
import { Button } from "@/components/ui/button";
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
import { isFresh } from "@/lib/live";
import {
  DRAFT_MAX_AGE_MS,
  GAME_TYPES,
  boardScored,
  draftKey as draftKeyFor,
  duplicateNotice,
  foldSummary,
  openingBoard,
  recentOpponents,
  seededBoard,
  type BoardSeed,
  type DuplicateGame,
} from "@/lib/report-form";
import { talkSummary } from "@/lib/table-talk";
import { cn } from "@/lib/utils";
import { confirmTheirs, findDuplicateReport, reportMatch } from "./actions";
import { clearLiveGame, publishLiveGame } from "./live-actions";

const DEFAULT_RACE = 5;
const NO_SEED: BoardSeed = { game: null, raceTo: null, rematch: false };

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
  // When a Rematch board opened (ISO, the server's clock: page.tsx
  // rematchOpenedAt), sent as the duplicate check's `since`
  // so the game it follows is not flagged. It belongs to the board, so it is
  // kept in the draft (a reload must not move it later, past the opponent's
  // report of this very game) and dropped when the opponent changes.
  since: string | null;
}

function freshDraft(today: string): Draft {
  return {
    at: Date.now(),
    opponentId: null,
    game: "8ball",
    raceTo: DEFAULT_RACE,
    spot: 0,
    spotTo: null,
    you: 0,
    them: 0,
    date: today,
    since: null,
  };
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
// sticky footer. Once a point is played the setup folds into one line and
// the score gets the room. The draft survives a locked phone via
// localStorage.
export function ReportMatchForm({
  opponents,
  recentIds,
  today,
  meId,
  myRating,
  initialOpponentId,
  initialPickerOpen = false,
  seed = NO_SEED,
  rematchOpenedAt = null,
  error,
}: {
  opponents: OpponentOption[];
  recentIds: string[];
  today: string;
  meId: string;
  myRating: number;
  initialOpponentId?: string;
  initialPickerOpen?: boolean;
  // A Rematch link's game, race and flag (lib/report-form boardParams),
  // already validated, and the server's time when that board opened. Both
  // belong to the link's own opponent (initialOpponentId) only.
  seed?: BoardSeed;
  rematchOpenedAt?: string | null;
  error?: string;
}) {
  const draftKey = draftKeyFor(meId);
  const seeded = seed.game !== null || seed.raceTo !== null || seed.rematch;
  // The board a called opponent gets: a spot from today's ratings and, for
  // the link's own opponent, its game, race and (Rematch) open time. Anyone
  // else (picked while the link's board was up, then Start new) gets the
  // plain board with no `since`, so their duplicate check stays whole.
  function calledBoard(o: OpponentOption): Draft {
    const own = o.id === initialOpponentId;
    return {
      ...freshDraft(today),
      opponentId: o.id,
      ...seededBoard(own ? seed : NO_SEED, o.rating, myRating, DEFAULT_RACE),
      since: own && seed.rematch ? rematchOpenedAt : null,
    };
  }
  // One state object for the board, lazily restored from the draft. This
  // component is loaded client-only (see page.tsx), so reading localStorage
  // in the initialiser is safe and there is no hydration mismatch. Called to
  // a table or a player (?opponent=), the board opens on that opponent: a
  // draft already against them is kept, an unscored one is replaced, and a
  // scored game against someone else is kept while the footer asks
  // (lib/report-form openingBoard) — it is never dropped silently. A Rematch
  // link also replaces an unscored draft already against them, since it
  // carries the game and race they just played; a scored one is kept.
  const [opening] = useState(() => {
    const draft = loadDraft(draftKey, opponents, today);
    const called = initialOpponentId ? opponents.find((o) => o.id === initialOpponentId) : undefined;
    const choice = openingBoard(draft, called?.id);
    if (!called) return { draft, askId: null as string | null };
    if (choice === "ask") return { draft, askId: called.id };
    if (choice === "keep" && (!seeded || boardScored(draft))) return { draft, askId: null };
    const board = calledBoard(called);
    // The same Rematch board opened again (a reload of its link) keeps its
    // first open time: a later one could skip the opponent's report of it.
    if (choice === "keep" && seed.rematch && draft.since) return { draft: { ...board, since: draft.since }, askId: null };
    return { draft: board, askId: null };
  });
  const [d, setD] = useState<Draft>(opening.draft);
  // The called opponent while the switch-guard notice is up.
  const [askId, setAskId] = useState<string | null>(opening.askId);
  // Edit opens the folded setup; the next score tap folds it again.
  const [unfolded, setUnfolded] = useState(false);
  const router = useRouter();
  const { opponentId, game, raceTo, spot, spotTo, you, them, date } = d;
  const patch = (next: Partial<Draft>) => setD((cur) => ({ ...cur, ...next, at: Date.now() }));
  const setYou = (v: number) => {
    patch({ you: v });
    setUnfolded(false);
  };
  const setThem = (v: number) => {
    patch({ them: v });
    setUnfolded(false);
  };
  const setDate = (v: string) => patch({ date: v });
  const setGame = (v: string) => patch({ game: v });
  const [editingDate, setEditingDate] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(initialPickerOpen);
  const [query, setQuery] = useState("");
  const buzzed = useRef<Side | null>(null);
  // The pending live publish, so Send can cancel it: a publish landing after
  // the report's delete would leave a finished table on everyone's Home.
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(false);
  // Send first asks the server for a game between you two that day
  // (lib/report-form findDuplicate); a hit replaces Send with a notice.
  const [dup, setDup] = useState<(DuplicateGame & { key: string }) | null>(null);
  const [checking, setChecking] = useState(false);
  const checked = useRef(false);
  // "We agreed — count it" vs "Send to … to confirm". Carried in a hidden
  // input, not the buttons' own name/value: a plain Send is intercepted for
  // the duplicate check and resubmitted with requestSubmit(), which has no
  // submitter. The duplicate notice's "Log as a new game" keeps the choice.
  const [agreed, setAgreed] = useState(false);
  // Table talk on this table (spec 2026-10-20-table-talk §5): the game id
  // comes back from each publish; clearing or sending the board ends it.
  const [gameId, setGameId] = useState<string | null>(null);
  const [talkOpen, setTalkOpen] = useState(false);
  const talk = useLiveComments(gameId, meId, [], {});
  const talkLine = talkSummary(talk.comments, talk.names);

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
    if (!opponentId || sent.current) return;
    // A draft restored hours later is a memory, not a table being played:
    // it goes live again only once someone touches it (every patch bumps `at`).
    if (!isFresh(new Date(d.at).toISOString(), new Date())) return;
    publishTimer.current = setTimeout(() => {
      publishTimer.current = null;
      if (sent.current) return;
      void publishLiveGame({ opponentId, gameType: game, raceTo, spot, spotTo: spotTo === "you" ? "me" : spotTo, you, them }).then(
        (r) => {
          if (r.gameId && !sent.current) setGameId(r.gameId);
        }
      );
    }, 600);
    return () => {
      if (publishTimer.current) clearTimeout(publishTimer.current);
    };
  }, [opponentId, game, raceTo, spot, spotTo, you, them, d.at]);

  const selected = opponents.find((o) => o.id === opponentId) ?? null;
  let chips = recentOpponents(recentIds, opponents);
  // A search-picked opponent who isn't a regular still needs a visible,
  // selected avatar — swap them in front and keep four.
  if (selected && !chips.some((c) => c.id === selected.id)) {
    chips = [selected, ...chips].slice(0, 4);
  }
  const firstName = (o: OpponentOption | null) => (o ? o.display_name.split(" ")[0] : null);
  const first = firstName(selected) ?? "Them";
  // The setup folds into one summary line once a point is played against a
  // chosen opponent. Not before one is chosen: picking someone restarts the
  // board from its spot, so a score without an opponent is not a game yet.
  const folded = selected !== null && boardScored(d) && !unfolded;
  // The date editor is part of the setup; folded, the hidden input carries it.
  const dateOpen = editingDate && !folded;
  // A notice belongs to the opponent and day it was found for.
  const dupKey = `${opponentId}|${date}`;
  const shownDup = dup?.key === dupKey ? dup : null;
  const notice = shownDup ? duplicateNotice(shownDup, first, today) : null;
  // The switch-guard notice: the scoreboard opened for someone else while a
  // scored game was in progress.
  const called = askId ? (opponents.find((o) => o.id === askId) ?? null) : null;
  const asking = called !== null;
  // The switch-guard and duplicate notices own the footer while they are up.
  const talkShown = talkLine.count > 0 && !notice && !asking;

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
      // A Rematch board's open time is about its opponent only.
      since: next.opponent === undefined ? d.since : null,
    });
    buzzed.current = null;
  }

  // A chip or the picker. The opponent already on the board changes nothing
  // (re-picking them used to restart the board and drop its score). Someone
  // else, mid-game, raises the same switch guard as arriving with
  // ?opponent= does: a scored game is never dropped without asking.
  function pickOpponent(o: OpponentOption) {
    if (o.id === opponentId) return;
    if (openingBoard(d, o.id) === "ask") {
      setAskId(o.id);
      return;
    }
    setAskId(null);
    applyFormat({ opponent: o });
  }

  // "Start new": the called opponent gets a fresh board, as the lazy
  // initialiser would have given had the old game been unscored.
  function startCalled(o: OpponentOption) {
    setAskId(null);
    setUnfolded(false);
    setD(calledBoard(o));
    buzzed.current = null;
    setGameId(null);
    setTalkOpen(false);
  }

  // "Keep that game": drop the ?opponent= so a reload does not ask again.
  function keepDraft() {
    setAskId(null);
    router.replace("/matches/new");
  }

  function clearBoard() {
    setAskId(null);
    setEditingDate(false);
    setUnfolded(false);
    setD(freshDraft(today));
    buzzed.current = null;
    setGameId(null);
    setTalkOpen(false);
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
      onSubmit={(e) => {
        // A choice from the notice goes straight through; a plain Send
        // checks first and resubmits when clear.
        const submitter = (e.nativeEvent as SubmitEvent).submitter;
        if (!submitter?.hasAttribute("data-duplicate-choice") && !checked.current) {
          e.preventDefault();
          if (checking || !opponentId) return;
          const form = e.currentTarget;
          const key = dupKey;
          setChecking(true);
          findDuplicateReport(opponentId, date, d.since)
            .catch(() => null) // reportMatch checks again on the server
            .then((found) => {
              setChecking(false);
              if (found) {
                setDup({ ...found, key });
                return;
              }
              checked.current = true;
              form.requestSubmit();
            });
          return;
        }
        checked.current = false;
        sent.current = true;
        if (publishTimer.current) clearTimeout(publishTimer.current);
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // ignore
        }
      }}
      className={cn(
        "flex flex-col gap-8",
        notice || asking ? "pb-72" : s.disabled ? (talkShown ? "pb-56" : "pb-36") : talkShown ? "pb-80" : "pb-56"
      )}
    >
      {/* The scoreboard's own header (PageHeader is server-only: it renders
          the async MessagesButton). Close returns to where you came from. */}
      <header className="flex items-center justify-between gap-3 pt-3">
        <BackButton fallback="/" label="Close" icon="close" />
        <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">
          {selected ? `vs ${first}` : "New game"}
        </h1>
        <span className="size-11 shrink-0" aria-hidden="true" />
      </header>
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}

      {folded && selected ? (
        // Opponent, game, race, spot and date in one line; the score gets the
        // room (spec 2026-10-21-play-and-progress §4).
        <div
          role="group"
          aria-label="Game setup"
          className="bg-card flex items-center gap-3 rounded-[18px] py-1 pr-1 pl-3 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
        >
          <Avatar person={selected} size="xs" />
          {/* Wraps, never truncates: with a spot the line runs long on a
              phone, and who holds the spot is the part that would be cut. */}
          <span className="min-w-0 flex-1 py-1 text-[13px] leading-snug">{foldSummary(d, first)}</span>
          <button
            type="button"
            onClick={() => setUnfolded(true)}
            className="press text-brass h-11 shrink-0 rounded-full px-3 text-[13px] font-semibold"
          >
            Edit
          </button>
        </div>
      ) : (
        <>
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
                  {/* Named game_pick: the hidden game_type carries the
                      game, folded or not. */}
                  <input
                    type="radio"
                    name="game_pick"
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
        </>
      )}

      <section className={cn("flex flex-col gap-[18px]", folded && "py-4")}>
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
            size={folded ? "lg" : "md"}
          />
          <span
            aria-hidden="true"
            className={cn("bg-hairline-divider w-px self-center", folded ? "h-[180px]" : "h-[120px]")}
          />
          <ScoreStepper
            label={first}
            value={them}
            onChange={setThem}
            canIncrement={canIncrement(race, "them")}
            canDecrement={canDecrement(race, "them")}
            progress={raceTo ? raceProgress(them, raceTo) : undefined}
            tone={leader === "them" ? "lead" : null}
            effect={done === "them" ? "win" : done === "you" ? "loss" : null}
            size={folded ? "lg" : "md"}
          />
        </div>
        <p
          aria-live="polite"
          className={cn("stat-number text-center", folded ? "text-[14px]" : "text-[13px]", openLine ? openLine.tone : lineTone)}
        >
          {openLine ? openLine.text : line}
        </p>
      </section>

      {!folded && (
        <section className="border-hairline-divider flex flex-col border-t">
          {dateOpen ? (
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
      )}

      {opponentId && <input type="hidden" name="opponent_id" value={opponentId} />}
      <input type="hidden" name="game_type" value={game} />
      <input type="hidden" name="my_score" value={you} />
      <input type="hidden" name="their_score" value={them} />
      <input type="hidden" name="race_to" value={raceTo ?? ""} />
      <input type="hidden" name="spot" value={spot} />
      <input type="hidden" name="spot_to" value={spotTo === "you" ? "me" : spotTo === "them" ? "them" : ""} />
      {!dateOpen && <input type="hidden" name="played_at" value={date} />}
      <input type="hidden" name="agreed" value={agreed ? "1" : ""} />
      <input type="hidden" name="since" value={d.since ?? ""} />

      <div className="bg-background border-hairline fixed inset-x-0 bottom-0 z-10 border-t">
        <div className="mx-auto flex max-w-3xl flex-col gap-2.5 px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {talkShown && talkLine.latest && (
            <button
              type="button"
              onClick={() => setTalkOpen(true)}
              className="press bg-card flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-left shadow-[inset_0_0_0_1px_var(--hairline-row)]"
            >
              <MessageCircle className="text-brass size-4 shrink-0" strokeWidth={1.7} aria-hidden="true" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="eyebrow">Table talk</span>
                <span className="truncate text-[13px]">
                  {talkLine.latest.name}: {talkLine.latest.body}
                </span>
              </span>
              <span className="text-muted-foreground stat-number text-[12px]">{talkLine.count}</span>
              <ChevronRight className="text-muted-foreground size-4 shrink-0" strokeWidth={1.7} />
            </button>
          )}
          {called ? (
            <>
              <div role="alert" className="flex flex-col gap-1 pb-1">
                <p className="text-[15px] font-medium">
                  {`You have a game in progress vs ${first} (${you}–${them})`}
                </p>
              </div>
              <Button type="button" size="xl" className="w-full" onClick={keepDraft}>
                Keep that game
              </Button>
              <Button type="button" size="xl" variant="ghost" className="w-full" onClick={() => startCalled(called)}>
                Start new
              </Button>
            </>
          ) : notice && shownDup ? (
            <>
              <div role="alert" className="flex flex-col gap-1 pb-1">
                <p className="text-[15px] font-medium">{notice.title}</p>
                <p className="text-muted-foreground text-[13px]">{notice.detail}</p>
              </div>
              {notice.canConfirm && (
                <>
                  {/* Not the button's own name/value: React drops those when
                      the button carries its own formAction. */}
                  <input type="hidden" name="match_id" value={shownDup.id} />
                  <SubmitButton
                    size="xl"
                    className="w-full"
                    formAction={confirmTheirs}
                    data-duplicate-choice=""
                    pendingChildren="Confirming…"
                  >
                    {`Confirm ${first}'s result`}
                  </SubmitButton>
                </>
              )}
              <SubmitButton
                size="xl"
                variant={notice.canConfirm ? "ghost" : "default"}
                className="w-full"
                name="allow_duplicate"
                value="1"
                data-duplicate-choice=""
                pendingChildren="Sending…"
              >
                Log as a new game
              </SubmitButton>
              <button
                type="button"
                onClick={() => setDup(null)}
                className="text-muted-foreground press self-center py-1 text-[12px]"
              >
                Cancel
              </button>
            </>
          ) : s.disabled ? (
            <>
              <SubmitButton size="xl" className="w-full" disabled pendingChildren="Sending…">
                {s.label}
              </SubmitButton>
              <p className="text-muted-foreground text-center text-[12px]">{s.reason}</p>
            </>
          ) : (
            <>
              {/* Both players agreed the score at the table: it counts now,
                  and the opponent can flag it for a day (spec
                  2026-10-20-agreed-results). Sending stays for when they've
                  already left. */}
              <SubmitButton
                size="xl"
                className="w-full"
                disabled={checking}
                onClick={() => setAgreed(true)}
                pendingChildren={agreed ? "Counting…" : "We agreed — count it"}
              >
                {checking && agreed ? "Counting…" : "We agreed — count it"}
              </SubmitButton>
              <SubmitButton
                size="xl"
                variant="ghost"
                className="w-full"
                disabled={checking}
                onClick={() => setAgreed(false)}
                pendingChildren={agreed ? s.label : "Sending…"}
              >
                {checking && !agreed ? "Sending…" : s.label}
              </SubmitButton>
              <p className="text-muted-foreground text-center text-[12px]">
                {`Count it if you both agree the score. ${first} can flag it for 24 hours.`}
              </p>
            </>
          )}
        </div>
      </div>

      <Dialog.Root open={talkOpen} onOpenChange={setTalkOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-3 rounded-t-[24px] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          >
            <Dialog.Title className="text-[17px] font-semibold tracking-[-0.01em]">Table talk</Dialog.Title>
            <TableTalk meId={meId} comments={talk.comments} names={talk.names} onSend={talk.send} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

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
