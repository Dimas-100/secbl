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
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Race to</legend>
          <div className="bg-card grid grid-cols-3 gap-1 rounded-full p-1">
            {[3, 5, 7].map((n) => (
              <label
                key={n}
                className="text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground flex h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium has-checked:font-semibold"
              >
                <input type="radio" name="race_to" value={n} defaultChecked={n === 5} aria-label={`Race to ${n}`} className="sr-only" />
                {n}
              </label>
            ))}
          </div>
          <p className="text-muted-foreground text-xs">
            Every match in the cup is a race to this many games. The score sheet fills toward it.
          </p>
        </fieldset>
        <Button type="submit" size="lg" className="w-full">
          Create
        </Button>
      </form>
      </div>
    </main>
  );
}
