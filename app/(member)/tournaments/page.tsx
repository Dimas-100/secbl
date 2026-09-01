import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setting up",
  live: "Live",
  complete: "Complete",
};

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>;
}) {
  const { message, error } = await searchParams;
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

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, status, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Tournaments</h1>
        {me?.role === "admin" && (
          <Button asChild size="sm">
            <Link href="/tournaments/new">New tournament</Link>
          </Button>
        )}
      </div>
      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>All tournaments</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {(tournaments ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing run yet.</p>
          )}
          {(tournaments ?? []).map((t) => (
            <Link
              key={t.id}
              href={t.status === "setup" ? `/tournaments/${t.id}/setup` : `/tournaments/${t.id}`}
              className="hover:bg-muted -mx-3 flex items-center justify-between rounded-md p-3"
            >
              <span className="font-medium">{t.name}</span>
              <Badge variant={t.status === "live" ? "default" : "secondary"}>
                {STATUS_LABEL[t.status]}
              </Badge>
            </Link>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
