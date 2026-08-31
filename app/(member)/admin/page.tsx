import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { approveProfile, rejectProfile } from "./actions";

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
    </main>
  );
}
