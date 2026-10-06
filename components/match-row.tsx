import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { cn } from "@/lib/utils";

export interface MatchRowPlayer {
  id: string;
  display_name: string;
}

// One confirmed match, the way a scoreboard app lists a result: winner first
// in bold with their avatar, the loser quieter, the race score as tabular
// numerals, and the winner's rating gain as a small chip. Shared by the
// league feed on Home and the history on a Player page.
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
  return (
    <div className="flex min-h-14 items-center gap-3 py-2">
      <div className="flex shrink-0 -space-x-2">
        <Avatar name={winner?.display_name} size="md" me={winnerIsMe} className="ring-2 ring-card" />
        <Avatar name={loser?.display_name} size="md" me={loserIsMe} className="ring-2 ring-card opacity-70" />
      </div>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-sm">
          <PlayerName player={winner} me={winnerIsMe} bold />
          <span className="text-muted-foreground"> def. </span>
          <PlayerName player={loser} me={loserIsMe} />
        </div>
        {(meta || gameType) && (
          <div className="text-muted-foreground mt-0.5 truncate text-[11px]">
            {meta}
            {meta && gameType ? " · " : ""}
            {gameType}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {delta !== null && (
          <span className="bg-win/10 text-win stat-number rounded-full px-1.5 py-0.5 text-[11px]">
            +{delta}
          </span>
        )}
        <span className="stat-number text-base">
          {winnerScore}–{loserScore}
        </span>
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
  const classes = cn(bold ? "font-bold" : "font-medium", me && "text-primary");
  if (!player) return <span className={classes}>{label}</span>;
  return (
    <Link href={`/players/${player.id}`} className={cn(classes, "underline-offset-2 hover:underline")}>
      {label}
    </Link>
  );
}
