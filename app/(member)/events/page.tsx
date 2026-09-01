import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { HeroBand } from "@/components/hero-band";
import { SectionLabel } from "@/components/section-label";
import { createClient } from "@/lib/supabase/server";
import { CLUB_TIMEZONE, formatEventWhen, partitionEvents } from "@/lib/events";

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

// Weekday/day chip in club wall-clock time, same zone lib/events reasons in.
function dateBlock(iso: string): { weekday: string; day: string } {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: CLUB_TIMEZONE }),
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: CLUB_TIMEZONE }),
  };
}

function EventRowLink({ event }: { event: EventRow }) {
  const { weekday, day } = dateBlock(event.starts_at);
  return (
    <Link
      href={`/events/${event.id}`}
      className="hover:bg-muted -mx-3 flex min-h-14 items-center gap-3 rounded-lg p-3"
    >
      <span className="bg-accent text-accent-foreground flex w-11 shrink-0 flex-col items-center rounded-lg py-1">
        <span className="text-[10px] font-bold uppercase">{weekday}</span>
        <span className="stat-number text-lg leading-tight">{day}</span>
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          <span className="truncate font-semibold">{event.title}</span>
          {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </span>
        <span className="text-muted-foreground truncate text-sm">
          {formatEventWhen(event.starts_at, event.ends_at)}
          {event.location && ` · ${event.location}`}
        </span>
        <span className="text-muted-foreground text-xs">{goingCount(event)} going</span>
      </span>
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
    <main>
      <HeroBand title="Events">
        {me?.role === "admin" && (
          <div className="mt-2">
            <Button asChild size="sm" variant="hero">
              <Link href="/events/new">New event</Link>
            </Button>
          </div>
        )}
      </HeroBand>

      <div className="-mt-3 flex flex-col gap-4">
        {message && (
          <p className="rounded-md bg-card p-3 text-sm shadow-[var(--shadow-card)]">{message}</p>
        )}
        {error && (
          <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
        )}

        <Card>
          <CardHeader>
            <SectionLabel>Upcoming</SectionLabel>
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
              <SectionLabel>Past</SectionLabel>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {past.map((event) => (
                <EventRowLink key={event.id} event={event} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
