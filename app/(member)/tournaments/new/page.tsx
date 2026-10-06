import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/server";
import { createTournament } from "@/app/(member)/tournaments/actions";

export default async function NewTournamentPage({
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
  if (me?.role !== "admin") redirect("/tournaments");

  const { data: events } = await supabase
    .from("events")
    .select("id, title")
    .eq("status", "scheduled")
    .order("starts_at");

  return (
    <main>
      <PageHeader title="New tournament" back="/events?tab=cups" trailing={null} />
      <div className="mt-6 flex flex-col gap-6">
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
      )}
      <form action={createTournament} className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" name="name" required maxLength={80} />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="event_id">Linked event (optional)</Label>
          <select
            id="event_id"
            name="event_id"
            defaultValue=""
            className="border-input h-10 rounded-md border bg-transparent px-3 text-base md:text-sm"
          >
            <option value="">No linked event</option>
            {(events ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" size="lg" className="w-full">
          Create
        </Button>
      </form>
      </div>
    </main>
  );
}
