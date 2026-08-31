import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isoToClubTime } from "@/lib/events";
import { createEvent } from "@/app/(member)/events/admin-actions";
import { EventForm, type EventFormDefaults } from "@/app/(member)/events/event-form";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const EMPTY: EventFormDefaults = {
  title: "",
  description: "",
  location: "",
  startsAtLocal: "",
  endsAtLocal: "",
};

export default async function NewEventPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string }>;
}) {
  const { error, from } = await searchParams;
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
  if (me?.role !== "admin") redirect("/events");

  // Duplicate: prefill from an existing event with the date bumped one week.
  let defaults = EMPTY;
  if (from) {
    const { data: source } = await supabase
      .from("events")
      .select("title, description, location, starts_at, ends_at")
      .eq("id", from)
      .single();
    if (source) {
      const bump = (iso: string) => isoToClubTime(new Date(new Date(iso).getTime() + WEEK_MS).toISOString());
      defaults = {
        title: source.title,
        description: source.description ?? "",
        location: source.location ?? "",
        startsAtLocal: bump(source.starts_at),
        endsAtLocal: source.ends_at ? bump(source.ends_at) : "",
      };
    }
  }

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">{from ? "Duplicate event" : "New event"}</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <EventForm action={createEvent} defaults={defaults} submitLabel="Create event" />
    </main>
  );
}
