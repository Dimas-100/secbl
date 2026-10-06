import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export interface MatchRowPlayer {
  id: string;
  display_name: string;
  avatar_url?: string | null;
  ball?: number | null;
}

// One confirmed match as a scoreboard line. Two text lines so names never
// truncate: the winner on top in bold, "def. loser · game" underneath; the
// race score as display numerals on the right with the winner's rating gain
// beneath it.
export function MatchRow({
  winner,
  loser,
  winnerScore,
  loserScore,
  delta,
  viewerId,
  meta,
  gameType,
}: {
  winner: MatchRowPlayer | null | undefined;
  loser: MatchRowPlayer | null | undefined;
  winnerScore: number;
  loserScore: number;
  delta: number | null;
  viewerId?: string;
  meta?: string;
  gameType?: string;
}) {
  const winnerIsMe = winner?.id === viewerId;
  const loserIsMe = loser?.id === viewerId;
  const sub = [meta, gameType].filter(Boolean).join(" · ");
  return (
    <div className="flex min-h-16 items-center gap-3 py-2.5">
      <div className="flex shrink-0 -space-x-2.5">
        <Avatar
          person={winner ?? { id: "unknown", display_name: null }}
          size="md"
          className="ring-card relative z-10 ring-2"
        />
        <Avatar
          person={loser ?? { id: "unknown", display_name: null }}
          size="md"
          className="ring-card ring-2 opacity-60 grayscale-[35%]"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] leading-tight">
          <PlayerName player={winner} me={winnerIsMe} bold />
        </div>
        <div className="text-muted-foreground mt-0.5 truncate text-[13px] leading-tight">
          <span>def. </span>
          <PlayerName player={loser} me={loserIsMe} />
          {sub && <span> · {sub}</span>}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end leading-none">
        <span className="stat-number text-[19px]">
          {winnerScore}–{loserScore}
        </span>
        {delta !== null && (
          <span className="stat-number text-win mt-1 text-[11px]">+{delta}</span>
        )}
      </div>
    </div>
  );
}

function PlayerName({
  player,
  me,
  bold = false,
}: {
  player: MatchRowPlayer | null | undefined;
  me: boolean;
  bold?: boolean;
}) {
  const label = me ? "You" : (player?.display_name ?? "Member");
  const classes = cn(bold ? "font-semibold" : "font-medium", me && "text-primary");
  if (!player) return <span className={classes}>{label}</span>;
  return (
    <Link href={`/players/${player.id}`} className={cn(classes, "underline-offset-2 hover:underline")}>
      {label}
    </Link>
  );
}
