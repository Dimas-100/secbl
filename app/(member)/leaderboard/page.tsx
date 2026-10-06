import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { ListRow } from "@/components/list-row";
import { PageHeader } from "@/components/page-header";
import { SchoolDot } from "@/components/school-dot";
import { Segmented } from "@/components/segmented";
import { UnderlineTabs } from "@/components/underline-tabs";
import { createClient } from "@/lib/supabase/server";
import { clubDateOf } from "@/lib/events";
import { movementSince, seasonLabel } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  display_name: string;
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

function Movement({ value }: { value: number | undefined }) {
  if (value === undefined || value === 0) {
    return <span className="text-muted-foreground stat-number text-[12px]">– this wk</span>;
  }
  const up = value > 0;
  return (
    <span className={cn("stat-number text-[12px]", up ? "text-win" : "text-loss")}>
      {up ? "+" : "−"}
      {Math.abs(value)} this wk
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
  searchParams: Promise<{ scope?: string; tab?: string }>;
}) {
  const { scope: rawScope, tab: rawTab } = await searchParams;
  const scope = rawScope === "school" ? "school" : "all";
  const tab = rawTab === "schools" ? "schools" : "players";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // new Date() rather than Date.now(): the React compiler's purity lint
  // rejects the latter in a component.
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [{ data: me }, { data: rows }, { data: weekHistory }, { data: schoolStats }, { data: schools }] =
    await Promise.all([
      supabase.from("profiles").select("schools(short_name)").eq("id", user.id).single(),
      supabase.from("leaderboard").select("*"),
      supabase
        .from("rating_history")
        .select("profile_id, rating_before, rating_after, created_at")
        .gte("created_at", weekAgo),
      supabase.from("school_stats").select("id, name, short_name, member_count, avg_rating, wins, losses"),
      supabase.from("schools").select("id, short_name, primary_color"),
    ]);
  const mySchool = (Array.isArray(me?.schools) ? me.schools[0] : me?.schools)?.short_name;

  const allRows = (rows ?? []) as Row[];
  const visible =
    scope === "school" && mySchool ? allRows.filter((r) => r.school_short_name === mySchool) : allRows;
  const current = Object.fromEntries(visible.map((r) => [r.id, r.rating]));
  const moves = movementSince(weekHistory ?? [], current);

  const podium = visible.slice(0, 3);
  const rest = visible.slice(3);
  // Second, first, third — the classic podium silhouette.
  const podiumOrder = [podium[1], podium[0], podium[2]];

  const schoolRows = (schoolStats ?? []) as SchoolRow[];
  const colorOf = Object.fromEntries((schools ?? []).map((s) => [s.id, s.primary_color as string | null]));
  const maxAvg = Math.max(1, ...schoolRows.map((s) => s.avg_rating));

  return (
    <main className="flex flex-col gap-7">
      <PageHeader overline={seasonLabel(clubDateOf(now.toISOString()))} title="Leaderboard" />
      <UnderlineTabs
        ariaLabel="Leaderboard type"
        value={tab}
        options={[
          { value: "players", label: "Players", href: scope === "school" ? "/leaderboard?scope=school" : "/leaderboard" },
          { value: "schools", label: "Schools", href: "/leaderboard?tab=schools" },
        ]}
      />

      {tab === "players" && (
        <div className="flex flex-col gap-7">
          {mySchool && (
            <div className="flex justify-end">
              <Segmented
                ariaLabel="Leaderboard scope"
                value={scope}
                className="w-fit"
                options={[
                  { value: "all", label: "League", href: "/leaderboard" },
                  { value: "school", label: mySchool, href: "/leaderboard?scope=school" },
                ]}
              />
            </div>
          )}

          {visible.length === 0 && (
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
                return (
                  <Link
                    key={r.id}
                    href={`/players/${r.id}`}
                    className="press flex min-w-0 flex-col items-center gap-2.5 text-center"
                  >
                    <Avatar person={r} size={rank === 1 ? "podium" : "xl"} ring={PODIUM_RING[rank - 1]} />
                    <span className={cn("text-[13px] leading-none font-semibold tracking-[0.06em]", PODIUM_TEXT[rank - 1])}>
                      #{rank}
                    </span>
                    <span className="flex w-full flex-col items-center gap-0.5">
                      <span className="w-full truncate text-[14px] font-medium">{r.display_name}</span>
                      <span className="text-muted-foreground stat-number text-[12px]">
                        {r.rating}
                        {r.matches_played < 10 && " *"}
                      </span>
                      <Movement value={moves[r.id]} />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {rest.length > 0 && (
            <ol aria-label={`Players ranked 4 to ${visible.length}`} className="flex flex-col">
              {rest.map((r, i) => {
                const isMe = r.id === user.id;
                return (
                  <li key={r.id}>
                    <ListRow
                      href={`/players/${r.id}`}
                      className={cn(isMe && "bg-card -mx-3 rounded-[14px] border-b-transparent px-3")}
                      leading={
                        <>
                          <span className="text-muted-foreground stat-number w-[22px] text-[13px]">{i + 4}</span>
                          <Avatar person={r} size="sm" />
                        </>
                      }
                      title={r.display_name}
                      meta={
                        <span className="flex items-center gap-1.5">
                          <SchoolDot color={r.school_color} />
                          {r.school_short_name}
                          <span aria-hidden="true">·</span>
                          <Movement value={moves[r.id]} />
                        </span>
                      }
                      trailing={
                        <>
                          <span className="stat-number text-[15px]">
                            {r.rating}
                            {r.matches_played < 10 && <span className="text-muted-foreground"> *</span>}
                          </span>
                          <span className="text-muted-foreground text-[12px]">
                            {r.wins}–{r.losses}
                          </span>
                        </>
                      }
                    />
                  </li>
                );
              })}
            </ol>
          )}

          {visible.length > 0 && (
            <p className="text-muted-foreground text-[12px]">* provisional (fewer than 10 matches)</p>
          )}
        </div>
      )}

      {tab === "schools" && (
        <div className="flex flex-col gap-5">
          <ol aria-label="School standings" className="flex flex-col">
            {schoolRows.map((s, i) => (
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
                      <SchoolDot color={colorOf[s.id]} size={8} />
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
