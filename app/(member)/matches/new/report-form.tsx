"use client";

import { useState } from "react";
import { Dialog } from "radix-ui";
import { Search } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScoreStepper } from "@/components/score-stepper";
import { SubmitButton } from "@/components/submit-button";
import { recentOpponents, submitState } from "@/lib/report-form";
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

// One screen, no keyboard: chips for the people you actually play, steppers
// for the score, a narrated submit. Search and date edit are the only two
// places a keyboard can appear, and both are opt-in taps.
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
  // selected chip — swap them in front and keep three.
  if (selected && !chips.some((c) => c.id === selected.id)) {
    chips = [selected, ...chips].slice(0, 3);
  }
  const firstName = (o: OpponentOption | null) =>
    o ? o.display_name.split(" ")[0] : null;
  const s = submitState(you, them, firstName(selected));
  const filtered = opponents.filter((o) =>
    o.display_name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <form action={reportMatch} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">
          Opponent
        </span>
        <div className="grid grid-cols-4 gap-2">
          {chips.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOpponentId(o.id)}
              aria-pressed={o.id === opponentId}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-xl",
                o.id === opponentId
                  ? "bg-primary text-primary-foreground"
                  : "bg-card shadow-[var(--shadow-card)]"
              )}
            >
              <Avatar
                person={o}
                size="sm"
                className={cn(o.id === opponentId && "ring-gold ring-2")}
              />
              <span className="max-w-full truncate px-1 text-[11px] font-semibold">
                {firstName(o)}
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-muted-foreground flex h-16 flex-col items-center justify-center gap-1 rounded-xl bg-card shadow-[var(--shadow-card)]"
          >
            <span className="border-muted-foreground/40 flex size-7 items-center justify-center rounded-full border border-dashed">
              <Search className="size-3.5" />
            </span>
            <span className="text-[11px] font-semibold">All</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px] font-bold tracking-[0.12em] uppercase">
          Score
        </span>
        <div className="flex gap-3">
          <ScoreStepper label="You" accent value={you} onChange={setYou} />
          <ScoreStepper
            label={firstName(selected) ?? "Them"}
            value={them}
            onChange={setThem}
          />
        </div>
      </div>

      <div className="bg-muted flex rounded-xl p-1">
        {GAME_TYPES.map((g) => (
          <label
            key={g.value}
            className="flex-1 has-checked:bg-card flex h-10 cursor-pointer items-center justify-center rounded-lg text-xs font-semibold has-checked:font-bold has-checked:shadow-[var(--shadow-card)]"
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

      {editingDate ? (
        <Input
          type="date"
          name="played_at"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          aria-label="Date played"
        />
      ) : (
        <p className="text-muted-foreground text-center text-xs">
          {date === today ? "Today" : date} ·{" "}
          <button
            type="button"
            onClick={() => setEditingDate(true)}
            className="underline underline-offset-2"
          >
            change date
          </button>
        </p>
      )}

      {opponentId && <input type="hidden" name="opponent_id" value={opponentId} />}
      <input type="hidden" name="my_score" value={you} />
      <input type="hidden" name="their_score" value={them} />
      {!editingDate && <input type="hidden" name="played_at" value={date} />}

      <div className="flex flex-col gap-2">
        <SubmitButton
          variant="hero"
          size="xl"
          className="w-full"
          disabled={s.disabled}
          pendingChildren="Reporting…"
        >
          {s.label}
        </SubmitButton>
        {s.reason && (
          <p className="text-muted-foreground text-center text-xs">{s.reason}</p>
        )}
        <p className="text-muted-foreground text-center text-xs">
          Your opponent confirms the result before it counts toward ratings.
        </p>
      </div>

      <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-20 bg-black/40" />
          <Dialog.Content
            aria-describedby={undefined}
            className="bg-background fixed inset-x-0 bottom-0 z-30 flex max-h-[75vh] flex-col gap-3 rounded-t-2xl p-4"
          >
            <Dialog.Title className="text-sm font-bold">Pick opponent</Dialog.Title>
            <Input
              autoFocus
              placeholder="Search members"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search members"
            />
            <div className="flex flex-col overflow-y-auto">
              {filtered.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOpponentId(o.id);
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className="press hover:bg-accent flex min-h-12 items-center justify-between gap-2 rounded-lg px-2 text-left text-sm font-medium"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Avatar person={o} size="sm" />
                    <span className="truncate">{o.display_name}</span>
                  </span>
                  {o.school && <Badge variant="secondary">{o.school}</Badge>}
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
