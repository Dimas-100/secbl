import { CalendarDays, Flag, Medal, Trophy, Users } from "lucide-react";
import { FlameMark } from "@/components/flame-mark";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { MatchRow } from "@/components/match-row";
import { TitleBadge } from "@/components/title-badge";
import { describeActivity, feedStamp, one, type FeedPerson, type FeedRow, type Recap } from "@/lib/feed";
import { GAME_LABEL } from "@/lib/identity";
import type { TitleName } from "@/lib/levels";

// One feed row. A confirmed result is the familiar MatchRow (your games
// read "Won 5–3", everyone else's read league-wide); every other moment is
// a hairline ListRow with a mark on the left. Every row keeps its time on the
// right. Rating and XP changes stay on the profile and the result card.
export function ActivityRow({ row, viewerId, now }: { row: FeedRow; viewerId: string; now: Date }) {
  const stamp = feedStamp(row.created_at, now);
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
        delta={null}
        viewerId={viewerId}
        perspectiveId={viewerId}
        gameType={GAME_LABEL[m.game_type] ?? m.game_type}
        // The race is the winner's score, so only a spot is worth the room.
        format={m.spot > 0 ? `${m.spot} spot` : null}
        stamp={stamp}
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
      trailing={<span className="text-muted-foreground text-[12px]">{stamp}</span>}
    />
  );
}

// A club event that has ended (lib/feed Recap): the same hairline row, with
// a calendar for an event and a crowd for a club night.
export function RecapRow({ recap, now }: { recap: Recap; now: Date }) {
  const Icon = recap.kind === "night" ? Users : CalendarDays;
  return (
    <ListRow
      href={recap.href}
      leading={
        <span className={ICON}>
          <Icon className="size-[18px]" strokeWidth={1.7} />
        </span>
      }
      title={recap.title}
      meta={recap.meta}
      trailing={<span className="text-muted-foreground text-[12px]">{feedStamp(recap.at, now)}</span>}
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
          <FlameMark size={20} className={`bg-background p-0.5 ${CORNER}`} />
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
