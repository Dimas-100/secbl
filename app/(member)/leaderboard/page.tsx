import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";

export default async function LeaderboardPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase.from("leaderboard").select("*");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Leaderboard</h1>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Player</TableHead>
            <TableHead>School</TableHead>
            <TableHead className="text-right">Rating</TableHead>
            <TableHead className="text-right">W–L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(rows ?? []).map((r, i) => (
            <TableRow key={r.id}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>
                <Link href={`/players/${r.id}`} className="font-medium underline-offset-2 hover:underline">
                  {r.display_name}
                </Link>
                {r.matches_played < 10 && (
                  <span className="text-muted-foreground"> *</span>
                )}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{r.school_short_name}</Badge>
              </TableCell>
              <TableCell className="text-right font-medium">{r.rating}</TableCell>
              <TableCell className="text-right">
                {r.wins}–{r.losses}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-xs text-muted-foreground">* provisional (fewer than 10 matches)</p>
    </main>
  );
}
