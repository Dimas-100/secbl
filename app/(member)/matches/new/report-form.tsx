"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { ChevronRight, Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Input } from "@/components/ui/input";
import { ScoreStepper } from "@/components/score-stepper";
import { SubmitButton } from "@/components/submit-button";
import { recentOpponents, resultLine, submitState } from "@/lib/report-form";
import { cn } from "@/lib/utils";
import { reportMatch } from "./actions";

const GAME_TYPES = [
  { value: "8ball", label: "8-ball" },
  { value: "9ball", label: "9-ball" },
  { value: "10ball", label: "10-ball" },
  { value: "other", label: "Other" },
] as const;

export interface OpponentOption {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  ball?: number | null;
  school: string | null;
}

// One screen, no keyboard: the four people you actually play, steppers for
// the score, a narrated submit in a sticky footer. Search and the date are
// the only two places a keyboard can appear, and both are opt-in taps.
export function ReportMatchForm({
  opponents,
  recentIds,
  today,
}: {
  opponents: OpponentOption[];
  recentIds: string[];
  today: string;
}) {
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [you, setYou] = useState(0);
  const [them, setThem] = useState(0);
  const [editingDate, setEditingDate] = useState(false);
  const [date, setDate] = useState(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = opponents.find((o) => o.id === opponentId) ?? null;
  let chips = recentOpponents(recentIds, opponents);
  // A search-picked opponent who isn't a regular still needs a visible,
  // selected avatar — swap them in front and keep four.
  if (selected && !chips.some((c) => c.id === selected.id)) {
    chips = [selected, ...chips].slice(0, 4);
  }
  const firstName = (o: OpponentOption | null) => (o ? o.display_name.split(" ")[0] : null);
  const s = submitState(you, them, firstName(selected));
  const line = resultLine(you, them);
  const filtered = opponents.filter((o) =>
    o.display_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <form action={reportMatch} className="flex flex-col gap-8 pb-36">
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
              onClick={() => setOpponentId(o.id)}
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
                defaultChecked={g.value === "8ball"}
                className="sr-only"
              />
              {g.label}
            </label>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-[18px]">
        <span className="eyebrow">Score</span>
        <div className="grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center">
          <ScoreStepper label="You" value={you} onChange={setYou} />
          <span aria-hidden="true" className="bg-hairline-divider h-[120px] w-px" />
          <ScoreStepper label={firstName(selected) ?? "Them"} value={them} onChange={setThem} />
        </div>
        <p
          aria-live="polite"
          className={cn(
            "stat-number text-center text-[13px]",
            line.tone === "win" ? "text-win" : line.tone === "loss" ? "text-loss" : "text-muted-foreground"
          )}
        >
          {line.text}
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
                    setOpponentId(o.id);
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
              {filtered.length === 0 && (
                <p className="text-muted-foreground p-2 text-sm">No members match.</p>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </form>
  );
}
