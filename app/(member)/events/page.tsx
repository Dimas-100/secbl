import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { formatEventWhen, partitionEvents } from "@/lib/events";

interface EventRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  rsvps: { response: string }[];
}

function goingCount(event: EventRow): number {
  return event.rsvps.filter((r) => r.response === "going").length;
}

function EventRowLink({ event }: { event: EventRow }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="hover:bg-muted flex flex-col gap-1 rounded-md p-3 -mx-3"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{event.title}</span>
        {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
      </div>
      <span className="text-muted-foreground text-sm">
        {formatEventWhen(event.starts_at, event.ends_at)}
        {event.location && ` · ${event.location}`}
      </span>
      <span className="text-muted-foreground text-xs">{goingCount(event)} going</span>
    </Link>
  );
}

export default async function EventsPage({
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

  const { data: events } = await supabase
    .from("events")
    .select("id, title, location, starts_at, ends_at, status, rsvps(response)")
    .order("starts_at");

  const { upcoming, past } = partitionEvents((events ?? []) as EventRow[], new Date());

  return (
    <main className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Events</h1>
        {me?.role === "admin" && (
          <Button asChild size="sm">
            <Link href="/events/new">New event</Link>
          </Button>
        )}
      </div>

      {message && <p className="rounded-md bg-muted p-3 text-sm">{message}</p>}
      {error && (
        <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Upcoming</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1">
          {upcoming.length === 0 && (
            <p className="text-muted-foreground text-sm">Nothing on the calendar yet.</p>
          )}
          {upcoming.map((event) => (
            <EventRowLink key={event.id} event={event} />
          ))}
        </CardContent>
      </Card>

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Past</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {past.map((event) => (
              <EventRowLink key={event.id} event={event} />
            ))}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
