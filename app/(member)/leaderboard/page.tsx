import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: rows } = await supabase.from("leaderboard").select("*");

  return (
    <main>
      <HeroBand title="Leaderboard" />
      <div className="-mt-3 flex flex-col gap-4">
        <Card>
          <CardContent className="divide-border/60 flex flex-col divide-y">
            {(rows ?? []).length === 0 && (
              <p className="text-muted-foreground py-2 text-sm">
                Nobody has a confirmed match yet.
              </p>
            )}
            {(rows ?? []).map((r, i) => (
              <div
                key={r.id}
                className={cn(
                  "flex min-h-12 items-center gap-3 py-2",
                  r.id === user?.id && "bg-accent -mx-6 px-6"
                )}
              >
                {i < 3 ? (
                  <span className="bg-gold text-gold-foreground stat-number w-7 shrink-0 rounded-md py-0.5 text-center text-sm">
                    {i + 1}
                  </span>
                ) : (
                  <span className="stat-number text-muted-foreground w-7 shrink-0 text-center text-sm">
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/players/${r.id}`}
                    // block, not inline: truncate can't clip an inline box,
                    // and one long display name drags the whole page wider.
                    className="block truncate font-semibold underline-offset-2 hover:underline"
                  >
                    {r.display_name}
                    {r.matches_played < 10 && (
                      <span className="text-muted-foreground font-normal"> *</span>
                    )}
                  </Link>
                  <div>
                    <Badge variant="secondary">{r.school_short_name}</Badge>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="stat-number text-lg leading-tight">{r.rating}</div>
                  <div className="text-muted-foreground text-xs">
                    {r.wins}–{r.losses}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-xs">
          * provisional (fewer than 10 matches)
        </p>
        <p className="text-sm">
          <Link href="/schools" className="underline">
            School standings
          </Link>
        </p>
      </div>
    </main>
  );
}
