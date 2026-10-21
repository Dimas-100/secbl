import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Button } from "@/components/ui/button";
import { freeTable, joinLine, leaveLine } from "@/app/(member)/night/actions";
import { myNightStatus, nightCardLine } from "@/lib/night";
import type { NightData } from "@/lib/night-data";

// Where you stand tonight and the one thing to do about it (spec
// 2026-10-20-club-night §4): get in line, leave it, or — once called — start
// the game if you keep score, or watch the table if the other player does.
// Server-rendered on Home (back "/") and at the top of /night.
export function NightCard({
  data,
  meId,
  back,
  now,
}: {
  data: NightData;
  meId: string;
  back: "/" | "/night";
  now: Date;
}) {
  const { night } = data;
  if (!night) return null;
  const status = myNightStatus(night, data.line, data.tables, meId, now);
  const opponent = status.kind === "playing" ? (data.people.get(status.opponentId) ?? null) : null;
  const line = nightCardLine(status, { tables: night.tables, waiting: data.line.length }, opponent?.display_name ?? null);
  const hidden = (
    <>
      <input type="hidden" name="night_id" value={night.id} />
      <input type="hidden" name="back" value={back} />
    </>
  );

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[17px] leading-snug font-medium">{line}</p>
      {status.kind === "out" && (
        <form action={joinLine}>
          {hidden}
          <SubmitButton size="xl" className="w-full" pendingChildren="Joining…">
            Get in line
          </SubmitButton>
        </form>
      )}
      {status.kind === "waiting" && (
        <form action={leaveLine}>
          {hidden}
          <SubmitButton size="xl" variant="ghost" className="w-full" pendingChildren="Leaving…">
            Leave line
          </SubmitButton>
        </form>
      )}
      {status.kind === "playing" && (
        <div className="flex flex-col gap-1">
          {status.keepsScore ? (
            <Button asChild size="xl" className="w-full">
              <Link href={`/matches/new?opponent=${status.opponentId}`}>Start game</Link>
            </Button>
          ) : (
            <Button asChild size="xl" variant="ghost" className="w-full">
              <Link href={`/live/${status.opponentId}`}>Watch the table</Link>
            </Button>
          )}
          <form action={freeTable} className="self-center">
            {hidden}
            <input type="hidden" name="table_no" value={status.tableNo} />
            <SubmitButton variant="link" size="sm" className="text-muted-foreground" pendingChildren="Freeing…">
              Free table
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
