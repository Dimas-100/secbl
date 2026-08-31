import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clubDateOf } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { reportMatch } from "./actions";

const GAME_TYPES = [
  { value: "8ball", label: "8-ball" },
  { value: "9ball", label: "9-ball" },
  { value: "10ball", label: "10-ball" },
  { value: "other", label: "Other" },
] as const;

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: opponents } = await supabase
    .from("profiles")
    .select("id, display_name, schools(short_name)")
    .eq("status", "approved")
    .neq("id", user.id)
    .order("display_name");

  const today = clubDateOf(new Date().toISOString());
  const selectClass =
    "border-input bg-transparent h-9 rounded-md border px-3 text-sm shadow-xs";

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Report a match</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <form action={reportMatch} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="opponent_id">Opponent</Label>
          <select id="opponent_id" name="opponent_id" required defaultValue="" className={selectClass}>
            <option value="" disabled>
              Choose opponent
            </option>
            {(opponents ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.display_name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="my_score">Your score</Label>
            <Input id="my_score" name="my_score" type="number" min={0} required />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="their_score">Their score</Label>
            <Input id="their_score" name="their_score" type="number" min={0} required />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="game_type">Game</Label>
            <select id="game_type" name="game_type" defaultValue="8ball" className={selectClass}>
              {GAME_TYPES.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="played_at">Date</Label>
            <Input id="played_at" name="played_at" type="date" defaultValue={today} required />
          </div>
        </div>
        <Button type="submit">Report match</Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Your opponent confirms the result before it counts toward ratings.
      </p>
    </main>
  );
}
