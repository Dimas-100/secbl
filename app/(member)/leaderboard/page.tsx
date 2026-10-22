import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { PageHeader } from "@/components/page-header";
import { SchoolMark, type SchoolMarkSchool } from "@/components/school-mark";
import { SectionHeading } from "@/components/section-heading";
import { Segmented } from "@/components/segmented";
import { TitleBadge } from "@/components/title-badge";
import { UnderlineTabs } from "@/components/underline-tabs";
import { createClient } from "@/lib/supabase/server";
import { clubDateOf } from "@/lib/events";
import { compareRank, isPlaced, toRankRow } from "@/lib/ranking";
import { emptySchoolsLine, gapLine, movementLabel, placingTag } from "@/lib/ranks";
import {
  formatClubDate,
  pointsUnit,
  seasonCountdownLabel,
  seasonProgress,
  unrankedLabel,
  type Standing,
} from "@/lib/season";
import { loadOpenSeason, loadSeasonStandings, loadSeasons } from "@/lib/season-data";
import { movementSince, seasonLabel } from "@/lib/stats";
import { cn } from "@/lib/utils";
import { levelOf, loadAllLevels } from "@/lib/xp-data";

interface Row {
  id: string;
  display_name: string;
  school_id: string;
  school_short_name: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
  avatar_url: string | null;
  ball: number | null;
  school_color: string | null;
}

interface SchoolRow {
  id: string;
  name: string;
  short_name: string;
  member_count: number;
  avg_rating: number;
  wins: number;
  losses: number;
}

// The week's movement as an arrow; nothing when nobody moved.
function Movement({ value }: { value: number | undefined }) {
  const label = movementLabel(value);
  if (!label) return null;
  return (
    <span className={cn("stat-number text-[12px]", label.tone === "win" ? "text-win" : "text-loss")}>{label.text}</span>
  );
}

// "placing 3/10": a small outlined pill, so the count isn't mistaken for a record.
function PlacingTag({ text }: { text: string }) {
  return (
    <span className="text-muted-foreground rounded-full px-1.5 py-px text-[10px] leading-snug shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">
      {text}
    </span>
  );
}

// Tailwind can't build class names from a template, so the podium tones are
// spelled out.
const PODIUM_TEXT = ["text-podium-1", "text-podium-2", "text-podium-3"];
const PODIUM_RING = ["var(--podium-1)", "var(--podium-2)", "var(--podium-3)"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; tab?: string; season?: string }>;
}) {
  const { scope: rawScope, tab: rawTab, season: rawSeason } = await searchParams;
  const scope = rawScope === "school" ? "school" : "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // new Date() rather than Date.now(): the React compiler's purity lint
  // rejects the latter in a component.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const today = clubDateOf(now.toISOString());
  const [{ data: me }, { data: rows }, { data: weekHistory }, { data: schoolStats }, { data: schools }, levels, openSeason, seasons] =
    await Promise.all([
      supabase.from("profiles").select("role, schools(short_name)").eq("id", user.id).single(),
      supabase.from("leaderboard").select("*"),
      supabase
        .from("rating_history")
        .select("profile_id, rating_before, rating_after, created_at")
        .gte("created_at", weekAgo),
      supabase.from("school_stats").select("id, name, short_name, member_count, avg_rating, wins, losses"),
      supabase.from("schools").select("id, short_name, primary_color, logo_url"),
      loadAllLevels(supabase),
      loadOpenSeason(supabase),
      loadSeasons(supabase),
    ]);
  const mySchool = (Array.isArray(me?.schools) ? me.schools[0] : me?.schools)?.short_name;
  const isAdmin = me?.role === "admin";

  // Season is the tab people race for, so it leads while one is open; a
  // closed season is reachable by id from the Past seasons list.
  const tab =
    rawTab === "schools"
      ? "schools"
      : rawTab === "players"
        ? "players"
        : rawTab === "season"
          ? "season"
          : openSeason
            ? "season"
            : "players";
  const viewed = rawSeason ? (seasons.find((s) => s.id === rawSeason) ?? null) : openSeason;
  const standings = tab === "season" && viewed ? await loadSeasonStandings(supabase, viewed) : [];
  const champion = viewed?.champion_id ? (standings.find((s) => s.id === viewed.champion_id) ?? null) : null;
  const progress = viewed && viewed.status === "open" ? seasonProgress(viewed, today) : null;
  const past = seasons.filter((s) => s.status === "closed" && s.id !== viewed?.id);

  const allRows = (rows ?? []) as Row[];
  const peopleById: Record<string, Row> = Object.fromEntries(allRows.map((r) => [r.id, r]));
  const visible =
    scope === "school" && mySchool ? allRows.filter((r) => r.school_short_name === mySchool) : allRows;
  const current = Object.fromEntries(visible.map((r) => [r.id, r.rating]));
  const moves = movementSince(weekHistory ?? [], current);

  // One ladder order (lib/ranking.ts): only members with a confirmed game hold
  // a rank; the rest wait under "Not placed yet".
  const ordered = [...visible].sort((a, b) => compareRank(toRankRow(a), toRankRow(b)));
  const placedRows = ordered.filter((r) => isPlaced(toRankRow(r)));
  const unplacedRows = ordered.filter((r) => !isPlaced(toRankRow(r)));
  const podium = placedRows.slice(0, 3);
  const rest = placedRows.slice(3);
  // Second, first, third — the classic podium silhouette.
  const podiumOrder = [podium[1], podium[0], podium[2]];

  // Your gap to the member above reads the visible scope's own ladder.
  const visibleRankRows = placedRows.map(toRankRow);

  const schoolRows = (schoolStats ?? []) as SchoolRow[];
  // Only schools with members hold a number; the rest fold into one line.
  const rankedSchools = schoolRows.filter((s) => s.member_count > 0);
  const emptyLine = emptySchoolsLine(schoolRows);
  const schoolById: Record<string, SchoolMarkSchool & { id: string }> = Object.fromEntries(
    ((schools ?? []) as (SchoolMarkSchool & { id: string })[]).map((s) => [s.id, s])
  );
  const maxAvg = Math.max(1, ...rankedSchools.map((s) => s.avg_rating));

  const rankedStandings = standings.filter((s) => s.rank !== null);
  const unrankedStandings = standings.filter((s) => s.rank === null);

  // The rank slot keeps its width when empty so names line up.
  const seasonRow = (s: Standing) => {
    const p = peopleById[s.id];
    const isMe = s.id === user.id;
    return (
      <li key={s.id}>
        <ListRow
          href={`/players/${s.id}`}
          className={cn(
            isMe && "bg-card -mx-3 rounded-[14px] border-b-transparent px-3",
            s.rank === null && "opacity-60"
          )}
          leading={
            <>
              <span
                className={cn("stat-number w-[22px] text-[13px]", s.rank === 1 ? "text-brass" : "text-muted-foreground")}
              >
                {s.rank}
              </span>
              <Avatar person={p ?? { id: s.id, display_name: s.display_name }} size="sm" />
            </>
          }
          title={
            <span className="flex items-center gap-1.5">
              <span className="truncate">{s.display_name}</span>
              <TitleBadge title={levelOf(levels, s.id).title} size={20} />
            </span>
          }
          meta={
            <span className="flex items-center gap-1.5">
              {p && (
                <>
                  <SchoolMark school={schoolById[p.school_id]} size={16} />
                  {p.school_short_name}
                  <span aria-hidden="true">·</span>
                </>
              )}
              {s.wins}–{s.losses}
            </span>
          }
          trailing={
            <>
              <span className="stat-number text-[15px]">{s.points}</span>
              <span className="text-muted-foreground text-[12px]">{pointsUnit(s.points)}</span>
            </>
          }
        />
      </li>
    );
  };

  const playerRow = (r: Row, rank: number | null) => {
    const isMe = r.id === user.id;
    const tag = placingTag(r.wins + r.losses);
    const gap = isMe ? gapLine(visibleRankRows, r.id) : null;
    const move = movementLabel(moves[r.id]);
    return (
      <li key={r.id}>
        <ListRow
          href={`/players/${r.id}`}
          className={cn(
            isMe && "bg-card -mx-3 rounded-[14px] border-b-transparent px-3",
            rank === null && !isMe && "opacity-60"
          )}
          leading={
            <>
              <span className="text-muted-foreground stat-number w-[22px] text-[13px]">{rank}</span>
              <Avatar person={r} size="sm" />
            </>
          }
          title={
            <span className="flex items-center gap-1.5">
              <span className="truncate">{r.display_name}</span>
              <TitleBadge title={levelOf(levels, r.id).title} size={20} />
            </span>
          }
          meta={
            <span className="flex min-w-0 items-center gap-1.5">
              {/* Your own row leads with the gap, so a narrow screen cuts the school, not the gap. */}
              {gap && (
                <>
                  <span className="shrink-0 whitespace-nowrap">{gap}</span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              {isMe && move && (
                <>
                  <Movement value={moves[r.id]} />
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span className="flex min-w-0 items-center gap-1.5">
                <SchoolMark school={schoolById[r.school_id]} size={16} />
                <span className="truncate">{r.school_short_name}</span>
              </span>
              {!isMe && move && (
                <>
                  <span aria-hidden="true">·</span>
                  <Movement value={moves[r.id]} />
                </>
              )}
            </span>
          }
          trailing={
            <>
              <span className={cn("stat-number text-[15px]", tag && "text-muted-foreground")}>{r.rating}</span>
              {tag ? (
                <PlacingTag text={tag} />
              ) : (
                <span className="text-muted-foreground text-[12px]">
                  {r.wins}–{r.losses}
                </span>
              )}
            </>
          }
        />
      </li>
    );
  };

  return (
    <main className="flex flex-col gap-7">
      <PageHeader overline={openSeason?.name ?? seasonLabel(today)} title="Leaderboard" />
      <UnderlineTabs
        ariaLabel="Leaderboard type"
        value={tab}
        options={[
          { value: "season", label: "Season", href: "/leaderboard?tab=season" },
          {
            value: "players",
            label: "Players",
            href: scope === "school" ? "/leaderboard?tab=players&scope=school" : "/leaderboard?tab=players",
          },
          { value: "schools", label: "Schools", href: "/leaderboard?tab=schools" },
        ]}
      />

      {tab === "season" && (
        <div className="flex flex-col gap-6">
          {!viewed && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No season running yet.
              {isAdmin && (
                <>
                  {" "}
                  <Link href="/admin" className="text-brass">
                    Open one from Admin.
                  </Link>
                </>
              )}
            </p>
          )}
          {viewed && (
            <>
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="eyebrow">{viewed.name}</span>
                  <span className="text-muted-foreground text-[12px]">{seasonCountdownLabel(viewed, today)}</span>
                </div>
                {progress !== null && (
                  <div className="bg-hairline-divider h-0.5">
                    <div className="bg-brass h-full" style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                )}
                {viewed.status === "closed" && champion && (
                  <ListRow
                    href={`/players/${champion.id}`}
                    leading={
                      <Avatar
                        person={peopleById[champion.id] ?? { id: champion.id, display_name: champion.display_name }}
                        size="md"
                        ring="var(--gold)"
                      />
                    }
                    title={`${champion.display_name} · champion`}
                    meta={`${champion.points} ${pointsUnit(champion.points)} · ${champion.wins}–${champion.losses}`}
                  />
                )}
              </div>
              {rankedStandings.length > 0 && (
                <ol aria-label="Season standings" className="flex flex-col">
                  {rankedStandings.map(seasonRow)}
                </ol>
              )}
              {unrankedStandings.length > 0 && (
                <section className="flex flex-col gap-1.5">
                  {/* The list is named by this label, so it is read once. */}
                  <span id="season-unranked-label" className="eyebrow">
                    {unrankedLabel(viewed.status)}
                  </span>
                  <ol aria-labelledby="season-unranked-label" className="flex flex-col">
                    {unrankedStandings.map(seasonRow)}
                  </ol>
                </section>
              )}
              <p className="text-muted-foreground text-[12px]">
                3 pts a win · 1 pt a loss · games played {formatClubDate(viewed.starts_on)}
                {viewed.ends_on ? ` – ${formatClubDate(viewed.ends_on)}` : " onward"}
              </p>
            </>
          )}
          {past.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <SectionHeading as="h3">Past seasons</SectionHeading>
              {past.map((s) => {
                const c = s.champion_id ? peopleById[s.champion_id] : null;
                return (
                  <ListRow
                    key={s.id}
                    href={`/leaderboard?tab=season&season=${s.id}`}
                    leading={c ? <Avatar person={c} size="sm" ring="var(--gold)" /> : undefined}
                    title={s.name}
                    meta={`${formatClubDate(s.starts_on)}${s.ends_on ? ` – ${formatClubDate(s.ends_on)}` : ""}${c ? ` · ${c.display_name}` : ""}`}
                  />
                );
              })}
            </section>
          )}
        </div>
      )}

      {tab === "players" && (
        <div className="flex flex-col gap-7">
          {mySchool && (
            <div className="flex justify-end">
              <Segmented
                ariaLabel="Leaderboard scope"
                value={scope}
                className="w-fit"
                options={[
                  { value: "all", label: "League", href: "/leaderboard?tab=players" },
                  { value: "school", label: mySchool, href: "/leaderboard?tab=players&scope=school" },
                ]}
              />
            </div>
          )}

          {placedRows.length === 0 && (
            <p className="text-muted-foreground py-10 text-center text-sm">
              Nobody is ranked here yet. Ratings move once a match is confirmed.{" "}
              <Link href="/matches/new" className="text-brass">
                Log one.
              </Link>
            </p>
          )}

          {podium.length > 0 && (
            <div className="grid grid-cols-3 items-end gap-3">
              {podiumOrder.map((r, slot) => {
                if (!r) return <div key={`empty-${slot}`} />;
                const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
                const tag = placingTag(r.wins + r.losses);
                const isMe = r.id === user.id;
                const gap = isMe ? gapLine(visibleRankRows, r.id) : null;
                return (
                  <Link
                    key={r.id}
                    href={`/players/${r.id}`}
                    className={cn(
                      "press flex min-w-0 flex-col items-center gap-2.5 text-center",
                      isMe && "bg-card rounded-[14px] px-1 py-3"
                    )}
                  >
                    <Avatar person={r} size={rank === 1 ? "podium" : "xl"} ring={PODIUM_RING[rank - 1]} />
                    <span className={cn("text-[13px] leading-none font-semibold tracking-[0.06em]", PODIUM_TEXT[rank - 1])}>
                      #{rank}
                      {isMe && <span className="text-muted-foreground font-normal tracking-normal"> · you</span>}
                    </span>
                    <span className="flex w-full flex-col items-center gap-0.5">
                      <span className="flex w-full items-center justify-center gap-1.5">
                        <span className="truncate text-[14px] font-medium">{r.display_name}</span>
                        <TitleBadge title={levelOf(levels, r.id).title} size={20} />
                      </span>
                      <span className="text-muted-foreground stat-number text-[12px]">{r.rating}</span>
                      {tag && <PlacingTag text={tag} />}
                      {gap && <span className="text-muted-foreground text-[11px] leading-tight">{gap}</span>}
                      <Movement value={moves[r.id]} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {rest.length > 0 && (
            <ol aria-label={`Players ranked 4 to ${placedRows.length}`} className="flex flex-col">
              {rest.map((r, i) => playerRow(r, i + 4))}
            </ol>
          )}

          {unplacedRows.length > 0 && (
            <section className="flex flex-col gap-1.5">
              <span id="players-unplaced-label" className="eyebrow">
                Not placed yet
              </span>
              <ol aria-labelledby="players-unplaced-label" className="flex flex-col">
                {unplacedRows.map((r) => playerRow(r, null))}
              </ol>
            </section>
          )}

        </div>
      )}

      {tab === "schools" && (
        <div className="flex flex-col gap-5">
          <ol aria-label="School standings" className="flex flex-col">
            {rankedSchools.map((s, i) => (
              <li key={s.id} className="border-hairline-row flex gap-4 border-b py-5">
                <span
                  className={cn(
                    "stat-number w-[34px] shrink-0 text-[22px] leading-[1.1]",
                    i === 0 ? "text-brass" : "text-muted-foreground"
                  )}
                >
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2 text-[16px] font-medium">
                      <SchoolMark school={schoolById[s.id]} size={28} />
                      <span className="truncate">{s.name}</span>
                    </span>
                    <span className="stat-number shrink-0 text-[15px]">{s.avg_rating}</span>
                  </div>
                  <div className="bg-hairline-divider h-0.5">
                    <div
                      className={cn("h-full", s.short_name === mySchool ? "bg-brass" : "bg-foreground/35")}
                      style={{ width: `${Math.round((s.avg_rating / maxAvg) * 100)}%` }}
                    />
                  </div>
                  <span className="text-muted-foreground text-[12px]">
                    {s.member_count} players · {s.wins}–{s.losses}
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {emptyLine && (
            <div className="bg-card flex items-center justify-between gap-3 rounded-[14px] px-3.5 py-3 text-[12px]">
              <span className="text-muted-foreground">{emptyLine}</span>
              <Link href="/install/card" className="text-brass font-semibold">
                Invite
              </Link>
            </div>
          )}
          <p className="text-muted-foreground text-[12px]">
            Ranked by average rating.{" "}
            <Link href="/schools" className="text-brass">
              School vs school
            </Link>
          </p>
        </div>
      )}
    </main>
  );
}
