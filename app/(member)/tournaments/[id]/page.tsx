import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Avatar, type AvatarIdentity } from "@/components/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { bracketRounds, roundName, type GeneratedMatch } from "@/lib/bracket";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { LiveRefresh } from "./refresh";

interface MatchRow extends GeneratedMatch {
  player1_score: number | null;
  player2_score: number | null;
}

interface Entrant extends AvatarIdentity {
  seed: number;
  school: string | null;
}

function matchName(index: number, count: number, position: number): string {
  const fromEnd = count - 1 - index;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return `Semifinal ${position + 1}`;
  if (fromEnd === 2) return `Quarterfinal ${position + 1}`;
  return `Match ${position + 1}`;
}

// The cup as a scoreboard: match cards by round, the next match outlined in
// brass, results with the loser muted, the champion on top when it is over.
// Scoring lives on its own sheet (/score/[matchId]); members and the admin
// read the same bracket, the admin also gets the Score buttons.
export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { id } = await params;
  const { error, message } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: me }, { data: tournament }] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).single(),
    supabase.from("tournaments").select("id, name, status, race_to").eq("id", id).single(),
  ]);
  if (!tournament) notFound();
  if (tournament.status === "setup") redirect(`/tournaments/${id}/setup`);

  const [{ data: rows }, { data: entrantRows }] = await Promise.all([
    supabase
      .from("tournament_matches")
      .select("id, round, position, player1_id, player2_id, player1_score, player2_score, winner_id, winner_advances_to, winner_advances_slot")
      .eq("tournament_id", id),
    supabase
      .from("tournament_players")
      .select("profile_id, seed, profiles(id, display_name, avatar_url, ball, schools(short_name))")
      .eq("tournament_id", id)
      .order("seed"),
  ]);

  const entrants = new Map<string, Entrant>();
  for (const e of entrantRows ?? []) {
    const p = Array.isArray(e.profiles) ? e.profiles[0] : e.profiles;
    const school = p ? (Array.isArray(p.schools) ? p.schools[0] : p.schools) : null;
    entrants.set(e.profile_id as string, {
      id: e.profile_id as string,
      display_name: p?.display_name ?? "Unknown",
      avatar_url: p?.avatar_url ?? null,
      ball: p?.ball ?? null,
      seed: e.seed as number,
      school: school?.short_name ?? null,
    });
  }

  const matches = (rows ?? []) as MatchRow[];
  const rounds = bracketRounds(matches) as MatchRow[][];
  const final = matches.find((m) => m.winner_advances_to === null);
  const champion = tournament.status === "complete" && final?.winner_id ? entrants.get(final.winner_id) : null;
  const isAdmin = me?.role === "admin";
  const live = tournament.status === "live";

  // Byes are not matches: the player simply starts a round later. Note it on
  // the match they advance into instead of drawing a fake fixture.
  const isBye = (m: MatchRow) => m.player2_id === null && m.player1_id !== null && m.winner_id !== null;
  const feederOf = (m: MatchRow, slot: 1 | 2) =>
    matches.find((x) => x.winner_advances_to === m.id && x.winner_advances_slot === slot);
  const champRecord = champion
    ? matches.filter((m) => !isBye(m) && m.winner_id === champion.id).length
    : 0;

  // The first undecided, playable match is "up next"; the rest wait.
  const nextId = matches
    .filter((m) => m.player1_id && m.player2_id && !m.winner_id)
    .sort((a, b) => a.round - b.round || a.position - b.position)[0]?.id;

  return (
    <main className="flex flex-col gap-7">
      {live && <LiveRefresh />}
      <PageHeader
        title={tournament.name}
        back="/events?tab=cups"
        trailing={
          live ? <Badge className="bg-brass text-background">Live</Badge> : <Badge variant="secondary">Complete</Badge>
        }
      />
      {message && <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}

      {champion && (
        <section className="bg-card flex items-center gap-4 rounded-[20px] p-5 shadow-[inset_0_0_0_1px_var(--brass)]">
          <Avatar person={champion} size="lg" ring="var(--brass)" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="eyebrow">Champion</h2>
            <span className="truncate text-[20px] leading-tight font-semibold tracking-[-0.02em]">
              <Link href={`/players/${champion.id}`}>{champion.display_name}</Link>
            </span>
            <span className="text-muted-foreground text-[12px]">
              {[champion.school, `${champRecord}–0 in the cup`, "+300 XP"].filter(Boolean).join(" · ")}
            </span>
          </div>
        </section>
      )}

      <nav aria-label="Rounds" className="-mx-6 flex gap-2 overflow-x-auto px-6 [scrollbar-width:none]">
        {rounds.map((_, i) => (
          <a
            key={i}
            href={`#round-${i + 1}`}
            className="bg-card text-muted-foreground shrink-0 rounded-full px-3.5 py-1.5 text-[12px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-row)]"
          >
            {roundName(i, rounds.length)}
          </a>
        ))}
      </nav>

      {[...rounds].map((round, index) => ({ round, index })).reverse().map(({ round, index }) => (
        <section key={index} id={`round-${index + 1}`} className="flex flex-col gap-3 scroll-mt-4">
          <h2 className="eyebrow">{roundName(index, rounds.length)}</h2>
          {round
            .filter((m) => !isBye(m))
            .map((m) => {
              const p1 = m.player1_id ? entrants.get(m.player1_id) : null;
              const p2 = m.player2_id ? entrants.get(m.player2_id) : null;
              const decided = m.winner_id !== null;
              const ready = !!(m.player1_id && m.player2_id);
              const isNext = m.id === nextId;
              const status = decided ? "Final" : isNext ? "Up next" : ready ? "Ready" : "Waiting";
              const slotNote = (slot: 1 | 2) => {
                const f = feederOf(m, slot);
                if (!f) return null;
                if (isBye(f) && f.player1_id) return "bye";
                const a = f.player1_id ? entrants.get(f.player1_id)?.display_name?.split(" ")[0] : null;
                const b = f.player2_id ? entrants.get(f.player2_id)?.display_name?.split(" ")[0] : null;
                return a && b ? `Winner of ${a} vs ${b}` : `Winner of ${matchName(f.round - 1, rounds.length, f.position)}`;
              };
              const Row = ({ p, score, slot }: { p: Entrant | null | undefined; score: number | null; slot: 1 | 2 }) => {
                const won = decided && p && m.winner_id === p.id;
                const lost = decided && p && m.winner_id !== p.id;
                const note = slotNote(slot);
                return (
                  <div className={cn("flex items-center gap-3", lost && "text-muted-foreground")}>
                    {p ? (
                      <Avatar person={p} size="xs" className={cn(lost && "opacity-60")} />
                    ) : (
                      <span className="bg-secondary text-muted-foreground flex size-[30px] shrink-0 items-center justify-center rounded-full text-[12px]">
                        ?
                      </span>
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className={cn("truncate text-[15px] leading-tight", won ? "font-semibold" : "font-medium")}>
                        {p ? <Link href={`/players/${p.id}`}>{p.display_name}</Link> : (note ?? "TBD")}
                      </span>
                      <span className="text-muted-foreground text-[12px] leading-tight">
                        {p
                          ? [p.seed, p.school, note === "bye" ? "bye into this round" : null].filter(Boolean).join(" · ")
                          : ""}
                      </span>
                    </span>
                    <span className={cn("stat-number text-[26px] leading-none", !decided && "text-muted-foreground", lost && "text-muted-foreground")}>
                      {decided ? score : "–"}
                    </span>
                  </div>
                );
              };
              return (
                <article
                  key={m.id}
                  className={cn(
                    "bg-card flex flex-col gap-3 rounded-[20px] px-4 py-3.5",
                    isNext && live ? "shadow-[inset_0_0_0_1.5px_var(--brass)]" : "shadow-[inset_0_0_0_1px_var(--hairline-row)]"
                  )}
                >
                  <div className="flex items-center justify-between text-[11px] tracking-[0.08em] uppercase">
                    <span className="text-muted-foreground">
                      {matchName(index, rounds.length, m.position)} · race to {tournament.race_to}
                    </span>
                    <span className={cn(isNext && live ? "text-brass font-semibold" : "text-muted-foreground")}>{status}</span>
                  </div>
                  <Row p={p1} score={m.player1_score} slot={1} />
                  <div className="bg-hairline-row h-px" />
                  <Row p={p2} score={m.player2_score} slot={2} />
                  {isAdmin && live && ready && !decided && (
                    <Button asChild size="default" className="mt-1 w-full">
                      <Link href={`/tournaments/${id}/score/${m.id}`}>Score this match</Link>
                    </Button>
                  )}
                  {isAdmin && decided && (
                    <Link
                      href={`/tournaments/${id}/score/${m.id}`}
                      className="text-muted-foreground press self-end text-[12px] underline-offset-2 hover:underline"
                    >
                      Fix score or void
                    </Link>
                  )}
                </article>
              );
            })}
        </section>
      ))}
    </main>
  );
}
