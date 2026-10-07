import Link from "next/link";
import { Avatar } from "@/components/avatar";
import type { FeedPerson } from "@/lib/feed";
import { GAME_LABEL } from "@/lib/identity";
import { liveLine } from "@/lib/live";
import { formatLabel } from "@/lib/race";
import { cn } from "@/lib/utils";

export interface LiveGameRow {
  reporter_id: string;
  opponent_id: string;
  game_type: string;
  race_to: number | null;
  spot: number;
  spot_to: string | null;
  reporter_score: number;
  opponent_score: number;
  reporter: FeedPerson | null;
  opponent: FeedPerson | null;
}

// A table being played right now: both faces, the format, the score as two
// hero numbers and a rail each toward the finish. The reporter's own card
// takes them back to their scoreboard.
export function LiveGameCard({ row, viewerId }: { row: LiveGameRow; viewerId: string }) {
  const name = (p: FeedPerson | null, id: string) =>
    id === viewerId ? "You" : (p?.display_name ?? "Member").split(" ")[0];
  const r = name(row.reporter, row.reporter_id);
  const o = name(row.opponent, row.opponent_id);
  const spotName = row.spot_to === row.reporter_id ? r : row.spot_to === row.opponent_id ? o : null;
  const line = liveLine(row);
  const mine = row.reporter_id === viewerId;
  const reporterLeads = row.reporter_score >= row.opponent_score;
  const body = (
    <>
      <div className="flex items-center gap-3">
        <div className="flex shrink-0">
          <Avatar
            person={row.reporter ?? { id: row.reporter_id, display_name: null }}
            size="md"
            className="ring-background relative z-10 ring-2"
          />
          <Avatar
            person={row.opponent ?? { id: row.opponent_id, display_name: null }}
            size="md"
            className="ring-background -ml-3 ring-2"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] font-medium">
            {r} vs {o}
          </span>
          <span className="text-muted-foreground truncate text-[12px]">
            {[GAME_LABEL[row.game_type] ?? row.game_type, formatLabel(row.race_to, row.spot, spotName) ?? "Open play"].join(
              " · "
            )}
          </span>
        </div>
        <span className="stat-number shrink-0 text-[22px] leading-none">
          {row.reporter_score}
          <span className="text-muted-foreground">–</span>
          {row.opponent_score}
        </span>
      </div>
      {row.race_to && (
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-hairline-divider h-0.5">
            <div
              className={cn("h-full", reporterLeads ? "bg-win" : "bg-foreground/35")}
              style={{ width: `${Math.round(line.reporter * 100)}%` }}
            />
          </div>
          <div className="bg-hairline-divider h-0.5">
            <div
              className={cn("ml-auto h-full", !reporterLeads ? "bg-win" : "bg-foreground/35")}
              style={{ width: `${Math.round(line.opponent * 100)}%` }}
            />
          </div>
        </div>
      )}
      {(line.need || mine) && (
        <span className="text-muted-foreground text-[12px]">
          {line.need}
          {mine && <span className="text-brass">{line.need ? " · " : ""}Your game</span>}
        </span>
      )}
    </>
  );
  const cls = "bg-card flex flex-col gap-3 rounded-[20px] p-4 shadow-[inset_0_0_0_1px_var(--hairline-row)]";
  return mine ? (
    <Link href="/matches/new" className={cn("press", cls)}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
