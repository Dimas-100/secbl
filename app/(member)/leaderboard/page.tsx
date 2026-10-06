import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { Segmented } from "@/components/segmented";
import { createClient } from "@/lib/supabase/server";
import { movementSince } from "@/lib/stats";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  display_name: string;
  school_short_name: string;
  rating: number;
  matches_played: number;
  wins: number;
  losses: number;
}

function Movement({ value }: { value: number | undefined }) {
  if (value === undefined || value === 0) {
    return <span className="text-muted-foreground text-[11px]">– this week</span>;
  }
  const up = value > 0;
  return (
    <span className={cn("stat-number text-[11px]", up ? "text-win" : "text-loss")}>
      {up ? "▲" : "▼"} {Math.abs(value)}
      <span className="text-muted-foreground ml-1 font-medium">this week</span>
    </span>
  );
}

const PODIUM = ["bg-gold text-gold-foreground", "bg-muted text-foreground", "bg-accent text-accent-foreground"];

export default async function LeaderboardPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>;
}) {
  const { scope: rawScope } = await searchParams;
  const scope = rawScope === "school" ? "school" : "all";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // new Date() rather than Date.now(): the React compiler's purity lint
  // rejects the latter in a component.
  const weekAgo = new Date(new Date().getTime() - 7 * 86_400_000).toISOString();
  const [{ data: me }, { data: rows }, { data: weekHistory }] = await Promise.all([
    supabase.from("profiles").select("schools(short_name)").eq("id", user.id).single(),
    supabase.from("leaderboard").select("*"),
    supabase
      .from("rating_history")
      .select("profile_id, rating_before, rating_after, created_at")
      .gte("created_at", weekAgo),
  ]);
  const mySchool = (Array.isArray(me?.schools) ? me.schools[0] : me?.schools)?.short_name;

  const allRows = (rows ?? []) as Row[];
  const visible = scope === "school" && mySchool ? allRows.filter((r) => r.school_short_name === mySchool) : allRows;
  const current = Object.fromEntries(visible.map((r) => [r.id, r.rating]));
  const moves = movementSince(weekHistory ?? [], current);

  const podium = visible.slice(0, 3);
  const rest = visible.slice(3);
  // Second, first, third — the classic podium silhouette.
  const podiumOrder = [podium[1], podium[0], podium[2]];

  return (
    <main>
      <HeroBand title="Leaderboard">
        <div className="mt-3">
          <Segmented
            ariaLabel="Leaderboard scope"
            value={scope}
            options={[
              { value: "all", label: "Whole league", href: "/leaderboard" },
              { value: "school", label: mySchool ? `${mySchool} only` : "My school", href: "/leaderboard?scope=school" },
            ]}
          />
        </div>
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        {visible.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-4xl">🏆</span>
              <p className="text-sm font-semibold">Nobody is ranked here yet.</p>
              <p className="text-muted-foreground text-sm">
                Ratings move once a match is confirmed.{" "}
                <Link href="/matches/new" className="underline">
                  Report one.
                </Link>
              </p>
            </CardContent>
          </Card>
        )}

        {podium.length > 0 && (
          <div className="grid grid-cols-3 items-end gap-2">
            {podiumOrder.map((r, slot) => {
              if (!r) return <div key={`empty-${slot}`} />;
              const rank = slot === 1 ? 1 : slot === 0 ? 2 : 3;
              const isMe = r.id === user.id;
              return (
                <Link
                  key={r.id}
                  href={`/players/${r.id}`}
                  className={cn(
                    "press bg-card flex flex-col items-center gap-1.5 rounded-xl px-2 pb-3 text-center shadow-[var(--shadow-card)]",
                    rank === 1 ? "pt-4" : "pt-3",
                    isMe && "ring-primary ring-2"
                  )}
                >
                  <span className="relative">
                    <Avatar name={r.display_name} size={rank === 1 ? "lg" : "md"} me={isMe} />
                    <span
                      className={cn(
                        "stat-number absolute -right-1.5 -bottom-1 flex size-5 items-center justify-center rounded-full text-[10px] ring-2 ring-card",
                        PODIUM[rank - 1]
                      )}
                    >
                      {rank}
                    </span>
                  </span>
                  <span className="w-full truncate text-xs font-semibold">
                    {r.display_name}
                    {r.matches_played < 10 && <span className="text-muted-foreground font-normal"> *</span>}
                  </span>
                  <span className={cn("stat-number leading-none", rank === 1 ? "text-2xl" : "text-xl")}>
                    {r.rating}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">
                    {r.school_short_name}
                  </Badge>
                  <Movement value={moves[r.id]} />
                </Link>
              );
            })}
          </div>
        )}

        {rest.length > 0 && (
          <Card className="py-2">
            <CardContent className="divide-border/60 flex flex-col divide-y px-3">
              {rest.map((r, i) => {
                const isMe = r.id === user.id;
                return (
                  <Link
                    key={r.id}
                    href={`/players/${r.id}`}
                    className={cn(
                      "press flex min-h-14 items-center gap-3 rounded-lg px-2 py-2",
                      isMe && "bg-accent"
                    )}
                  >
                    <span className="stat-number text-muted-foreground w-6 shrink-0 text-center text-sm">
                      {i + 4}
                    </span>
                    <Avatar name={r.display_name} size="md" me={isMe} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-sm font-semibold">
                        {r.display_name}
                        {r.matches_played < 10 && <span className="text-muted-foreground font-normal"> *</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">
                          {r.school_short_name}
                        </Badge>
                        <Movement value={moves[r.id]} />
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="stat-number block text-lg leading-tight">{r.rating}</span>
                      <span className="text-muted-foreground text-xs">
                        {r.wins}–{r.losses}
                      </span>
                    </span>
                  </Link>
                );
              })}
            </CardContent>
          </Card>
        )}

        <p className="text-muted-foreground text-xs">* provisional (fewer than 10 matches)</p>
        <p className="text-sm">
          <Link href="/schools" className="underline">
            School standings
          </Link>
        </p>
      </div>
    </main>
  );
}
