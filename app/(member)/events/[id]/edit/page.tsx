import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isoToClubTime } from "@/lib/events";
import {
  cancelEvent,
  deleteEvent,
  updateEvent,
} from "@/app/(member)/events/admin-actions";
import { EventForm } from "@/app/(member)/events/event-form";
import { DeleteEventButton } from "@/app/(member)/events/[id]/delete-button";

export default async function EditEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
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
  if (me?.role !== "admin") redirect("/events");

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, status")
    .eq("id", id)
    .single();
  if (!event) notFound();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-xl font-bold">Edit event</h1>
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      <EventForm
        action={updateEvent}
        eventId={event.id}
        submitLabel="Save changes"
        defaults={{
          title: event.title,
          description: event.description ?? "",
          location: event.location ?? "",
          startsAtLocal: isoToClubTime(event.starts_at),
          endsAtLocal: event.ends_at ? isoToClubTime(event.ends_at) : "",
        }}
      />

      <div className="flex flex-col gap-3 border-t pt-6">
        <p className="text-muted-foreground text-sm">
          Cancelling keeps the event visible with a Cancelled badge so members who
          RSVP&apos;d can see it. Deleting removes it and its RSVPs for good.
        </p>
        <div className="flex gap-2">
          {event.status === "scheduled" && (
            <form action={cancelEvent}>
              <input type="hidden" name="event_id" value={event.id} />
              <Button size="sm" variant="outline" type="submit">
                Cancel event
              </Button>
            </form>
          )}
          <form action={deleteEvent}>
            <input type="hidden" name="event_id" value={event.id} />
            <DeleteEventButton title={event.title} />
          </form>
        </div>
      </div>
    </main>
  );
}
