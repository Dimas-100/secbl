import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { adminRejectMatch, adminResolveMatch, approveProfile, rejectProfile } from "./actions";

export default async function AdminPage({
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
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/");

  const { data: pending } = await supabase
    .from("profiles")
    .select("id, display_name, created_at, schools(short_name)")
    .eq("status", "pending")
    .order("created_at");

  const { data: disputed } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, game_type, played_at, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "disputed")
    .order("created_at");

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Admin</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Signup approvals</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No pending signups.</p>
          )}
          {(pending ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.display_name}</span>
                <Badge variant="secondary">
                  {Array.isArray(p.schools)
                    ? (p.schools as Array<{ short_name: string }>)[0]?.short_name
                    : (p.schools as { short_name: string })?.short_name}
                </Badge>
              </div>
              <div className="flex gap-2">
                <form action={approveProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button size="sm" type="submit">
                    Approve
                  </Button>
                </form>
                <form action={rejectProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button size="sm" variant="outline" type="submit">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Disputed matches</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {(disputed ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes.</p>
          )}
          {(disputed ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            return (
              <div key={m.id} className="flex flex-col gap-3 border-b pb-4 last:border-b-0">
                <p className="text-sm">
                  {reporter?.display_name} reported {m.reporter_score}–{m.opponent_score} vs{" "}
                  {opponent?.display_name} ({m.game_type}, {m.played_at}) — rejected by opponent.
                </p>
                <form action={adminResolveMatch} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="match_id" value={m.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    Winner
                    <select
                      name="winner_id"
                      required
                      defaultValue=""
                      className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                    >
                      <option value="" disabled>
                        Pick winner
                      </option>
                      <option value={reporter?.id}>{reporter?.display_name}</option>
                      <option value={opponent?.id}>{opponent?.display_name}</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {reporter?.display_name}
                    <Input
                      name="reporter_score"
                      type="number"
                      min={0}
                      defaultValue={m.reporter_score}
                      className="w-20"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {opponent?.display_name}
                    <Input
                      name="opponent_score"
                      type="number"
                      min={0}
                      defaultValue={m.opponent_score}
                      className="w-20"
                    />
                  </label>
                  <Button size="sm" type="submit">
                    Apply &amp; confirm
                  </Button>
                </form>
                <form action={adminRejectMatch}>
                  <input type="hidden" name="match_id" value={m.id} />
                  <Button size="sm" variant="outline" type="submit">
                    Reject permanently
                  </Button>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </main>
  );
}
