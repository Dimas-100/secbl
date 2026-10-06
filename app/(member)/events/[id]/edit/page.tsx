import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { HeroBand } from "@/components/hero-band";
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
    .select("id, title, description, location, starts_at, ends_at, status, source_id, external_url, source:event_sources(name)")
    .eq("id", id)
    .single();
  if (!event) notFound();
  const source = Array.isArray(event.source) ? event.source[0] : event.source;

  return (
    <main>
      <HeroBand title="Edit event" />
      <div className="mt-4 flex flex-col gap-4">
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}
      {event.source_id ? (
        // Imported events are owned by the school system. Editing here would
        // be overwritten by the next sync, so the form is replaced by a note.
        <div className="rounded-xl bg-card p-4 text-sm shadow-[var(--shadow-card)]">
          <p className="font-semibold">This event comes from {source?.name ?? "a school feed"}.</p>
          <p className="text-muted-foreground mt-1">
            Its title, time, place and description update automatically from that feed, so
            they can&apos;t be edited here. Change it where it was posted
            {event.external_url && (
              <>
                {" "}
                (<a href={event.external_url} target="_blank" rel="noreferrer" className="underline">
                  open it
                </a>
                )
              </>
            )}
            . You can still cancel or delete it in SECBL.
          </p>
        </div>
      ) : (
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
      )}

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
      </div>
    </main>
  );
}
