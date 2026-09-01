import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { SectionLabel } from "@/components/section-label";
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
    <main>
      <HeroBand title="Tournaments">
        {me?.role === "admin" && (
          <div className="mt-2">
            <Button asChild size="sm" variant="hero">
              <Link href="/tournaments/new">New tournament</Link>
            </Button>
          </div>
        )}
      </HeroBand>
      <div className="-mt-3 flex flex-col gap-4">
      {message && (
        <p className="rounded-md bg-card p-3 text-sm shadow-[var(--shadow-card)]">{message}</p>
      )}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <Card>
        <CardHeader>
          <SectionLabel>All tournaments</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {(tournaments ?? []).length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing run yet.</p>
          )}
          {(tournaments ?? []).map((t) => {
            const badge =
              t.status === "live" ? (
                <Badge className="bg-gold text-gold-foreground">{STATUS_LABEL[t.status]}</Badge>
              ) : (
                <Badge variant="secondary">{STATUS_LABEL[t.status]}</Badge>
              );
            // A tournament still being set up has nothing to show a member yet,
            // and its only page is admin-only — so don't offer them the click.
            if (t.status === "setup" && me?.role !== "admin") {
              return (
                <div
                  key={t.id}
                  className="-mx-3 flex items-center justify-between p-3"
                >
                  <span className="text-muted-foreground">{t.name}</span>
                  {badge}
                </div>
              );
            }
            return (
              <Link
                key={t.id}
                href={t.status === "setup" ? `/tournaments/${t.id}/setup` : `/tournaments/${t.id}`}
                className="hover:bg-muted -mx-3 flex items-center justify-between rounded-md p-3"
              >
                <span className="font-medium">{t.name}</span>
                {badge}
              </Link>
            );
          })}
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
