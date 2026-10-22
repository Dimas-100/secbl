import { redirect } from "next/navigation";
import { clubDateOf } from "@/lib/events";
import { boardParams } from "@/lib/report-form";
import { createClient } from "@/lib/supabase/server";
import type { OpponentOption } from "./report-form";
import { ReportMatchFormLoader } from "./report-form-loader";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; opponent?: string; find?: string; game?: string; race?: string; rematch?: string }>;
}) {
  const { error, opponent, find, game, race, rematch } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: opponents }, { data: me }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, ball, rating, schools(short_name)")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("display_name"),
    supabase.from("profiles").select("rating").eq("id", user.id).single(),
  ]);

  // Recency drives the opponent row: whoever you actually play, any status.
  const { data: myMatches } = await supabase
    .from("matches")
    .select("reporter_id, opponent_id, created_at")
    .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(30);
  const recentIds = (myMatches ?? []).map((m) =>
    m.reporter_id === user.id ? m.opponent_id : m.reporter_id
  );

  const options: OpponentOption[] = (opponents ?? []).map((o) => {
    const school = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    return {
      id: o.id,
      display_name: o.display_name,
      avatar_url: o.avatar_url,
      ball: o.ball,
      school: school?.short_name ?? null,
      rating: o.rating,
    };
  });

  const today = clubDateOf(new Date().toISOString());
  const seed = boardParams({ game, race, rematch });
  // A Rematch board's open time, on the server's clock (the one created_at
  // is on), not the phone's: a phone running ahead would push it past the
  // opponent's report of the rematch and the duplicate check would miss it.
  const rematchOpenedAt = seed.rematch ? new Date().toISOString() : null;

  // The scoreboard renders its own header: its title follows the board
  // ("New game", then "vs {first}"), which only the client knows.
  return (
    <main className="flex flex-col gap-8">
      <ReportMatchFormLoader
        opponents={options}
        recentIds={recentIds}
        today={today}
        meId={user.id}
        myRating={me?.rating ?? 450}
        // Club night's "Start game", a face, Play {name}, Rematch: the board
        // opens with the called opponent.
        initialOpponentId={options.some((o) => o.id === opponent) ? opponent : undefined}
        // The Play sheet's "Other": the picker opens on arrival.
        initialPickerOpen={find === "1"}
        // Rematch (the game-counts screen): the same game and race, validated.
        seed={seed}
        rematchOpenedAt={rematchOpenedAt}
        error={error}
      />
    </main>
  );
}
