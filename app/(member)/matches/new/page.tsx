import { redirect } from "next/navigation";
import { clubDateOf } from "@/lib/events";
import { boardParams } from "@/lib/report-form";
import { createClient } from "@/lib/supabase/server";
import type { OpponentOption } from "./report-form";
import { ReportMatchFormLoader } from "./report-form-loader";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    opponent?: string;
    find?: string;
    game?: string;
    race?: string;
    rematch?: string;
    after?: string;
  }>;
}) {
  const { error, opponent, find, game, race, rematch, after } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const seed = boardParams({ game, race, rematch, after });
  // The game a Rematch board follows (ruling S4-R6), read on the server: a
  // counted game between you and the link's opponent. Its created_at starts
  // the duplicate check, so that game is not flagged but any report of the
  // rematch is, whenever this board opens. Not found, the check stays strict.
  const rematchedOf =
    seed.rematch && seed.after && typeof opponent === "string" && UUID_RE.test(opponent) ? opponent : null;
  const [{ data: opponents }, { data: me }, { data: rematched }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, ball, rating, schools(short_name)")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("display_name"),
    supabase.from("profiles").select("rating").eq("id", user.id).single(),
    rematchedOf
      ? supabase
          .from("matches")
          .select("created_at")
          .eq("id", seed.after!)
          .eq("status", "confirmed")
          .in("reporter_id", [user.id, rematchedOf])
          .in("opponent_id", [user.id, rematchedOf])
          .maybeSingle()
      : Promise.resolve({ data: null }),
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
  const initialOpponentId = options.some((o) => o.id === opponent) ? opponent : undefined;
  const rematchAfter = initialOpponentId && rematched ? (rematched.created_at as string) : null;

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
        initialOpponentId={initialOpponentId}
        // The Play sheet's "Other": the picker opens on arrival.
        initialPickerOpen={find === "1"}
        // Rematch (the game-counts screen): the same game and race, validated,
        // and the rematched game's created_at for the duplicate check.
        seed={seed}
        rematchAfter={rematchAfter}
        error={error}
      />
    </main>
  );
}
