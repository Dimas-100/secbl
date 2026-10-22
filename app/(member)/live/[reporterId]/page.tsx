import Link from "next/link";
import { redirect } from "next/navigation";
import { LiveGameCard, type LiveGameRow } from "@/components/live-game-card";
import { LiveRefresh } from "@/components/live-refresh";
import { LiveTalk } from "@/components/table-talk";
import { PageHeader } from "@/components/page-header";
import { one, type FeedPerson } from "@/lib/feed";
import { LIVE_STALE_MS } from "@/lib/live";
import { createClient } from "@/lib/supabase/server";
import type { LiveComment } from "@/lib/table-talk";

const firstName = (p: FeedPerson | null) => (p?.display_name ?? "Member").trim().split(/\s+/)[0];

// A table being played right now, for everyone watching it: the board, and
// table talk underneath (spec 2026-10-20-table-talk §5). When the result is
// sent or the board is cleared, the row goes and this page says so.
export default async function LiveGamePage({ params }: { params: Promise<{ reporterId: string }> }) {
  const { reporterId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: game } = await supabase
    .from("live_games")
    .select(
      "id, reporter_id, opponent_id, game_type, race_to, spot, spot_to, reporter_score, opponent_score, updated_at, reporter:profiles!live_games_reporter_id_fkey(id, display_name, avatar_url, ball), opponent:profiles!live_games_opponent_id_fkey(id, display_name, avatar_url, ball)"
    )
    .eq("reporter_id", reporterId)
    .gte("updated_at", new Date(new Date().getTime() - LIVE_STALE_MS).toISOString())
    .maybeSingle();

  if (!game) {
    return (
      <main className="flex flex-col gap-8">
        <PageHeader title="Live" back="/" history trailing={null} />
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-[17px] font-medium">This game is over.</p>
          <Link href="/" className="text-brass text-[14px]">
            Back to Home
          </Link>
        </div>
        <LiveRefresh />
      </main>
    );
  }

  const reporter = one(game.reporter as FeedPerson | FeedPerson[] | null);
  const opponent = one(game.opponent as FeedPerson | FeedPerson[] | null);
  const row: LiveGameRow = { ...game, reporter, opponent };

  const { data: talkRows } = await supabase
    .from("live_comments")
    .select("id, game_id, author_id, body, created_at, author:profiles!live_comments_author_id_fkey(display_name)")
    .eq("game_id", game.id)
    .order("id", { ascending: false })
    .limit(50);
  const initial: LiveComment[] = [];
  const names: Record<string, string> = {};
  for (const r of [...(talkRows ?? [])].reverse()) {
    initial.push({ id: r.id, game_id: r.game_id, author_id: r.author_id, body: r.body, created_at: r.created_at });
    const author = one(r.author as { display_name: string } | { display_name: string }[] | null);
    if (author) names[r.author_id] = author.display_name;
  }

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title={`${firstName(reporter)} vs ${firstName(opponent)}`} back="/" history trailing={null} />
      <LiveGameCard row={row} viewerId={user.id} link={false} />
      <section className="flex flex-col gap-3">
        <span className="eyebrow">Table talk</span>
        <LiveTalk key={game.id} gameId={game.id} meId={user.id} initial={initial} initialNames={names} />
      </section>
      <LiveRefresh />
    </main>
  );
}
