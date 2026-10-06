import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import { addClubWeek } from "@/lib/events";
import { createEvent } from "@/app/(member)/events/admin-actions";
import { EventForm, type EventFormDefaults } from "@/app/(member)/events/event-form";

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
      defaults = {
        title: source.title,
        description: source.description ?? "",
        location: source.location ?? "",
        startsAtLocal: addClubWeek(source.starts_at),
        endsAtLocal: source.ends_at ? addClubWeek(source.ends_at) : "",
      };
    }
  }

  return (
    <main>
      <PageHeader title={from ? "Duplicate event" : "New event"} back="/events" trailing={null} />
      <div className="mt-6 flex flex-col gap-6">
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
      )}
      <EventForm action={createEvent} defaults={defaults} submitLabel="Create event" />
      </div>
    </main>
  );
}
