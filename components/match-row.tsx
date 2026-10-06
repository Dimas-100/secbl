import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export interface MatchRowPlayer {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  ball?: number | null;
}

// One confirmed match as a hairline row.
//   perspective given (your games on Home, a player's history on Profile):
//     [opponent avatar]  Opponent name          Won 5–3
//                        game · date               +16
//   no perspective (league-wide feed):
//     [winner][loser]    Winner name            5–3
//                        def. Loser · game         +16
// Win/loss by weight, not colour: the result reads primary for a win and muted
// for a loss. `delta` is the winner's gain; a loss shows it negated.
export function MatchRow({
  winner,
  loser,
  winnerScore,
  loserScore,
  delta,
  viewerId,
  perspectiveId,
  meta,
  gameType,
  format,
  caption,
}: {
  winner: MatchRowPlayer | null | undefined;
  loser: MatchRowPlayer | null | undefined;
  winnerScore: number;
  loserScore: number;
  delta: number | null;
  viewerId?: string;
  perspectiveId?: string;
  meta?: string;
  gameType?: string;
  // "race to 5 · 2 spot" from lib/race formatShort; absent for open play.
  format?: string | null;
  caption?: React.ReactNode;
}) {
  const sub = [gameType, format, meta].filter(Boolean).join(" · ");
  const won = perspectiveId !== undefined && winner?.id === perspectiveId;
  const lost = perspectiveId !== undefined && loser?.id === perspectiveId;
  const rowClass = "border-hairline-row flex min-h-[68px] items-center gap-3.5 border-b py-3.5";

  if (won || lost) {
    const opponent = won ? loser : winner;
    const signed = delta === null ? null : won ? `+${delta}` : `−${delta}`;
    return (
      <div className={rowClass}>
        <Avatar person={opponent ?? { id: "unknown", display_name: null }} size="md" />
        <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
          <span className="truncate text-[15px] leading-tight font-medium">
            <PlayerName player={opponent} me={opponent?.id === viewerId} />
          </span>
          {sub && <span className="text-muted-foreground truncate text-[12px] leading-tight">{sub}</span>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[3px] text-right">
          <span className={cn("stat-number text-[15px] leading-tight", lost && "text-muted-foreground")}>
            {won ? "Won" : "Lost"} {won ? winnerScore : loserScore}–{won ? loserScore : winnerScore}
          </span>
          {signed && (
            <span className="text-muted-foreground stat-number text-[12px] leading-tight">{signed}</span>
          )}
          {caption && <span className="text-muted-foreground text-[11px] leading-tight">{caption}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className={rowClass}>
      <div className="flex shrink-0">
        <Avatar
          person={winner ?? { id: "unknown", display_name: null }}
          size="md"
          className="ring-background relative z-10 ring-2"
        />
        <Avatar
          person={loser ?? { id: "unknown", display_name: null }}
          size="md"
          className="ring-background -ml-3 ring-2 opacity-60"
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] leading-tight font-medium">
          <PlayerName player={winner} me={winner?.id === viewerId} />
        </span>
        <span className="text-muted-foreground truncate text-[12px] leading-tight">
          def. <PlayerName player={loser} me={loser?.id === viewerId} />
          {sub && ` · ${sub}`}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-[3px] text-right">
        <span className="stat-number text-[15px] leading-tight">
          {winnerScore}–{loserScore}
        </span>
        {delta !== null && (
          <span className="text-muted-foreground stat-number text-[12px] leading-tight">+{delta}</span>
        )}
        {caption && <span className="text-muted-foreground text-[11px] leading-tight">{caption}</span>}
      </div>
    </div>
  );
}

function PlayerName({ player, me }: { player: MatchRowPlayer | null | undefined; me: boolean }) {
  const label = me ? "You" : (player?.display_name ?? "Member");
  if (!player) return <span>{label}</span>;
  return (
    <Link href={`/players/${player.id}`} className="underline-offset-2 hover:underline">
      {label}
    </Link>
  );
}
