import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export default async function SchoolsPage() {
  const supabase = await createClient();
  const { data: stats } = await supabase.from("school_stats").select("*");
  const { data: h2h } = await supabase.from("school_head_to_head").select("*");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Schools</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {(stats ?? []).map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{s.short_name}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm">
              <p className="text-muted-foreground">{s.name}</p>
              <p>
                <span className="font-medium">{s.member_count}</span> members ·{" "}
                <span className="font-medium">{s.avg_rating}</span> avg rating
              </p>
              <p>
                Record: <span className="font-medium">{s.wins}–{s.losses}</span>
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>School vs. school</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {(h2h ?? []).length === 0 && (
            <p className="text-muted-foreground">No cross-school matches yet.</p>
          )}
          {(h2h ?? []).map((r) => (
            <p key={`${r.winner_school_id}-${r.loser_school_id}`}>
              <span className="font-medium">{r.winner_short_name}</span> {r.wins} win
              {r.wins === 1 ? "" : "s"} over {r.loser_short_name}
            </p>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
