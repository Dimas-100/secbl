import { Flag, Flame, Medal, Trophy } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { TitleBadge } from "@/components/title-badge";
import { describeActivity, feedStamp, one, type FeedPerson, type FeedRow } from "@/lib/feed";
import { winnerDelta } from "@/lib/form";
import { GAME_LABEL } from "@/lib/identity";
import type { TitleName } from "@/lib/levels";
import { formatShort } from "@/lib/race";
import { labelPlayedDate } from "@/lib/stats";

// One feed row. A confirmed result is the familiar MatchRow (your games
// read "Won 5–3", everyone else's read league-wide); every other moment is
// a hairline ListRow with a mark on the left and the stamp on the right.
export function ActivityRow({
  row,
  viewerId,
  today,
  now,
  caption,
}: {
  row: FeedRow;
  viewerId: string;
  today: string;
  now: Date;
  caption?: React.ReactNode;
}) {
  if (row.kind === "match") {
    const m = one(row.match);
    if (!m) return null;
    const reporter = one(m.reporter);
    const opponent = one(m.opponent);
    const reporterWon = m.winner_id === reporter?.id;
    return (
      <MatchRow
        winner={reporterWon ? reporter : opponent}
        loser={reporterWon ? opponent : reporter}
        winnerScore={Math.max(m.reporter_score, m.opponent_score)}
        loserScore={Math.min(m.reporter_score, m.opponent_score)}
        delta={winnerDelta(m)}
        viewerId={viewerId}
        perspectiveId={viewerId}
        gameType={GAME_LABEL[m.game_type] ?? m.game_type}
        format={formatShort(m.race_to, m.spot)}
        meta={labelPlayedDate(m.played_at, today)}
        caption={caption}
      />
    );
  }
  const { title, meta, href } = describeActivity(row, viewerId);
  return (
    <ListRow
      href={href ?? undefined}
      leading={<Mark row={row} actor={one(row.actor)} />}
      title={title}
      meta={meta ?? undefined}
      trailing={<span className="text-muted-foreground text-[12px]">{feedStamp(row.created_at, now)}</span>}
    />
  );
}

const ICON =
  "bg-secondary flex size-10 shrink-0 items-center justify-center rounded-full shadow-[0_0_0_1px_var(--hairline-strong)]";
const CORNER = "ring-background absolute -right-1.5 -bottom-1.5 rounded-full ring-2";

function Mark({ row, actor }: { row: FeedRow; actor: FeedPerson | null }) {
  const person = actor ?? { id: "unknown", display_name: null };
  switch (row.kind) {
    case "badge":
      return (
        <span className="relative flex">
          <Avatar person={person} size="md" />
          <TitleBadge title={String(row.data.title) as TitleName} size={20} decorative className={CORNER} />
        </span>
      );
    case "streak":
      return (
        <span className="relative flex">
          <Avatar person={person} size="md" />
          <Flame className={`text-brass bg-background size-[18px] p-0.5 ${CORNER}`} strokeWidth={2} />
        </span>
      );
    case "pass":
    case "member_joined":
      return <Avatar person={person} size="md" />;
    case "cup_won":
    case "season_closed":
      return <Avatar person={person} size="md" ring="var(--gold)" />;
    case "cup_started":
    case "cup_round":
      return (
        <span className={ICON}>
          <Trophy className="size-[18px]" strokeWidth={1.7} />
        </span>
      );
    case "season_opened":
    case "season_week_left":
      return (
        <span className={ICON}>
          <Flag className="size-[18px]" strokeWidth={1.7} />
        </span>
      );
    default:
      return (
        <span className={ICON}>
          <Medal className="size-[18px]" strokeWidth={1.7} />
        </span>
      );
  }
}
