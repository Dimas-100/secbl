"use client";

import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { draftOpponent, type PlayPerson } from "@/app/(member)/play/actions";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { resumableDraft, resumeLine, type ResumableDraft } from "@/lib/play";
import { draftKey } from "@/lib/report-form";
import { cn, GOLD_EDGE } from "@/lib/utils";

// A game left halfway, at the foot of Home's needs-you stack (spec
// 2026-10-21-play-and-progress §2). The scoreboard's draft lives in this
// browser only, so the card is client-side: it reads the draft the way the
// Play sheet does (resumableDraft: a point played, inside the scoreboard's
// window) and asks the server who the opponent is. Nothing renders until
// both are there; the scoreboard restores the draft itself.
export function ResumeGameCard({ meId }: { meId: string }) {
  const [game, setGame] = useState<{ draft: ResumableDraft; opponent: PlayPerson } | null>(null);

  useEffect(() => {
    let draft: ResumableDraft | null = null;
    try {
      draft = resumableDraft(localStorage.getItem(draftKey(meId)), new Date().getTime());
    } catch {
      // Private mode or blocked storage: no game to go back to.
    }
    if (!draft) return;
    const found = draft;
    let cancelled = false;
    draftOpponent(found.opponentId).then(
      (opponent) => {
        if (!cancelled && opponent) setGame({ draft: found, opponent });
      },
      (err) => console.warn("Resume card: couldn't load the opponent", err)
    );
    return () => {
      cancelled = true;
    };
  }, [meId]);

  if (!game) return null;
  return (
    <ListRow
      href="/matches/new"
      className={cn(GOLD_EDGE, "border-b-0")}
      leading={<Avatar person={game.opponent} size="md" />}
      title="Back to your game"
      meta={resumeLine(game.draft, game.opponent.display_name)}
      trailing={<ChevronRight aria-hidden="true" className="text-muted-foreground size-4" strokeWidth={1.7} />}
    />
  );
}
