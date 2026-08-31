import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatEventWhen, tallyRsvps } from "@/lib/events";
import type { RsvpResponse } from "@/lib/types";
import { setRsvp } from "@/app/(member)/events/actions";

const RESPONSE_LABELS: { value: RsvpResponse; label: string }[] = [
  { value: "going", label: "Going" },
  { value: "maybe", label: "Maybe" },
  { value: "no", label: "Can't make it" },
];

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
    .select("id, title, description, location, starts_at, ends_at, status")
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

  const attendees = (rsvps ?? []) as AttendeeRow[];
  const tally = tallyRsvps(attendees, user.id);
  const isOver = new Date(event.ends_at ?? event.starts_at).getTime() < Date.now();
  const locked = event.status === "cancelled" || isOver;

  return (
    <main className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold">{event.title}</h1>
          {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </div>
        <p className="text-muted-foreground text-sm">
          {formatEventWhen(event.starts_at, event.ends_at)}
          {event.location && ` · ${event.location}`}
        </p>
        {me?.role === "admin" && (
          <div className="flex gap-3 text-sm">
            <Link href={`/events/${event.id}/edit`} className="underline">
              Edit
            </Link>
            <Link
              href={`/events/new?from=${event.id}`}
              className="text-muted-foreground underline"
            >
              Duplicate
            </Link>
          </div>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      {event.description && <p className="text-sm whitespace-pre-line">{event.description}</p>}

      <Card>
        <CardHeader>
          <CardTitle>Your RSVP</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {locked ? (
            <p className="text-muted-foreground text-sm">
              {event.status === "cancelled"
                ? "This event was cancelled."
                : "This event has already happened."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {RESPONSE_LABELS.map((option) => (
                <form action={setRsvp} key={option.value}>
                  <input type="hidden" name="event_id" value={event.id} />
                  <input type="hidden" name="response" value={option.value} />
                  <Button
                    size="sm"
                    type="submit"
                    variant={tally.mine === option.value ? "default" : "outline"}
                  >
                    {option.label}
                  </Button>
                </form>
              ))}
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            {tally.mine
              ? "Tap your answer again to clear it."
              : "You have not replied yet."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            {tally.going} going · {tally.maybe} maybe · {tally.no} out
          </CardTitle>
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
    </main>
  );
}
