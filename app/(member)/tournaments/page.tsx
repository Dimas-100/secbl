import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/list-row";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  setup: "Setting up",
  live: "Live",
  complete: "Complete",
};

// The full tournament list. The everyday entry point is the Cups tab on
// Events; this route stays for links and the admin flow.
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
      <PageHeader title="Tournaments" back="/events?tab=cups" trailing={null}>
        {me?.role === "admin" && (
          <div>
            <Button asChild size="sm" variant="ghost">
              <Link href="/tournaments/new">New tournament</Link>
            </Button>
          </div>
        )}
      </PageHeader>
      <div className="mt-6 flex flex-col gap-6">
        {message && <p className="bg-card rounded-2xl p-3 text-sm">{message}</p>}
        {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}
        <div className="flex flex-col">
          {(tournaments ?? []).length === 0 && (
            <p className="text-muted-foreground py-6 text-sm">Nothing run yet.</p>
          )}
          {(tournaments ?? []).map((t) => {
            const status = (
              <span className={cn("text-[12px] font-medium", t.status === "live" ? "text-brass" : "text-muted-foreground")}>
                {STATUS_LABEL[t.status]}
              </span>
            );
            // A tournament still being set up has nothing to show a member yet,
            // and its only page is admin-only — so don't offer them the click.
            const href =
              t.status === "setup"
                ? me?.role === "admin"
                  ? `/tournaments/${t.id}/setup`
                  : undefined
                : `/tournaments/${t.id}`;
            return <ListRow key={t.id} href={href} title={t.name} trailing={status} />;
          })}
        </div>
      </div>
    </main>
  );
}
