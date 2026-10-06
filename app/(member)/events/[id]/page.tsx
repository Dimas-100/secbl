import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SectionLabel } from "@/components/section-label";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "@/lib/supabase/server";
import { formatEventWhen, isEventOver, tallyRsvps } from "@/lib/events";
import type { RsvpResponse } from "@/lib/types";
import { setRsvp } from "@/app/(member)/events/actions";

const RESPONSE_LABELS: { value: RsvpResponse; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Out" },
];

const LOCKED_SUMMARY: Record<RsvpResponse, string> = {
  going: "You were going.",
  maybe: "You were a maybe.",
  no: "You couldn't make it.",
};

interface AttendeeRow {
  profile_id: string;
  response: RsvpResponse;
  profile: { display_name: string } | { display_name: string }[] | null;
}

function displayName(row: AttendeeRow): string {
  const profile = Array.isArray(row.profile) ? row.profile[0] : row.profile;
  return profile?.display_name ?? "Unknown";
}

export default async function EventPage({
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

  const { data: event } = await supabase
    .from("events")
    .select("id, title, description, location, starts_at, ends_at, status, source_id, source_name, external_url")
    .eq("id", id)
    .single();
  if (!event) notFound();

  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const { data: rsvps } = await supabase
    .from("rsvps")
    .select("profile_id, response, profile:profiles(display_name)")
    .eq("event_id", id);

  const sourceName = event.source_name ?? null;
  const attendees = (rsvps ?? []) as AttendeeRow[];
  const tally = tallyRsvps(attendees, user.id);
  // new Date() rather than Date.now(): same instant, but the React compiler's
  // purity lint flags Date.now in render, and this is how the home page does it.
  const locked = event.status === "cancelled" || isEventOver(event, new Date());

  return (
    <main>
      <PageHeader
        title={event.title}
        back="/events"
        trailing={event.status === "cancelled" ? <Badge variant="destructive">Cancelled</Badge> : null}
      >
        <p className="text-muted-foreground text-sm">
          {formatEventWhen(event.starts_at, event.ends_at)}
          {event.location && ` · ${event.location}`}
        </p>
        {event.source_id && (
          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
            <span className="bg-secondary rounded-full px-2 py-0.5 font-medium">
              From {sourceName ?? "school feed"}
            </span>
            {event.external_url && (
              <a href={event.external_url} target="_blank" rel="noreferrer" className="text-brass underline">
                View on {sourceName ?? "the school site"}
              </a>
            )}
          </p>
        )}
        {me?.role === "admin" && (
          <div className="flex gap-4 text-sm">
            <Link href={`/events/${event.id}/edit`} className="text-brass underline">
              {event.source_id ? "Manage" : "Edit"}
            </Link>
            <Link href={`/events/new?from=${event.id}`} className="text-brass underline">
              Duplicate
            </Link>
          </div>
        )}
      </PageHeader>

      <div className="mt-6 flex flex-col gap-6">
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
      )}

      {event.description && (
        <p className="rounded-xl bg-card p-4 text-sm whitespace-pre-line shadow-[inset_0_0_0_1px_var(--hairline-row)]">
          {event.description}
        </p>
      )}

      <Card>
        <CardHeader>
          <SectionLabel>Your RSVP</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {locked ? (
            <>
              <p className="text-muted-foreground text-sm">
                {event.status === "cancelled"
                  ? "This event was cancelled."
                  : "This event has already happened."}
              </p>
              <p className="text-muted-foreground text-xs">
                {tally.mine ? LOCKED_SUMMARY[tally.mine] : "You never replied."}
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2">
                {RESPONSE_LABELS.map((option) => (
                  <form action={setRsvp} key={option.value} className="contents">
                    <input type="hidden" name="event_id" value={event.id} />
                    <input type="hidden" name="response" value={option.value} />
                    <SubmitButton
                      className="h-11"
                      variant={tally.mine === option.value ? "default" : "outline"}
                    >
                      {option.label}
                    </SubmitButton>
                  </form>
                ))}
              </div>
              <p className="text-muted-foreground text-xs">
                {tally.mine
                  ? "Tap your answer again to clear it."
                  : "You have not replied yet."}
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>
            {tally.going} going · {tally.maybe} maybe · {tally.no} out
          </SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {attendees.length === 0 && <p className="text-muted-foreground">No RSVPs yet.</p>}
          {RESPONSE_LABELS.map((option) => {
            const group = attendees.filter((a) => a.response === option.value);
            if (group.length === 0) return null;
            return (
              <div key={option.value} className="flex flex-col gap-1">
                <span className="text-muted-foreground text-xs uppercase">{option.label}</span>
                <p>{group.map(displayName).join(", ")}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
