import Link from "next/link";
import { redirect } from "next/navigation";
import { type AvatarIdentity } from "@/components/avatar";
import { AvatarStack } from "@/components/avatar-stack";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListRow } from "@/components/list-row";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { SubmitButton } from "@/components/submit-button";
import { UnderlineTabs } from "@/components/underline-tabs";
import { createClient } from "@/lib/supabase/server";
import { CLUB_TIMEZONE, eventMentionsSchool, formatEventWhen, partitionEvents } from "@/lib/events";
import { cn } from "@/lib/utils";
import { setRsvp } from "@/app/(member)/events/actions";

interface EventRow {
  id: string;
  title: string;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "scheduled" | "cancelled";
  source_name: string | null;
  rsvps: {
    profile_id: string;
    response: string;
    profile: AvatarIdentity | AvatarIdentity[] | null;
  }[];
}

interface TournamentRow {
  id: string;
  name: string;
  status: "setup" | "live" | "complete";
}

const TABS = ["upcoming", "going", "school", "past", "cups"] as const;
type Tab = (typeof TABS)[number];

const EMPTY: Record<Tab, string> = {
  upcoming: "Nothing on the calendar yet.",
  going: "You haven't said you're going to anything yet.",
  school: "Nothing from your school coming up.",
  past: "No past events.",
  cups: "No cups yet.",
};

const STATUS_LABEL: Record<TournamentRow["status"], string> = {
  setup: "Setting up",
  live: "Live",
  complete: "Complete",
};

function goingPeople(event: EventRow): AvatarIdentity[] {
  return event.rsvps
    .filter((r) => r.response === "going")
    .map((r) => (Array.isArray(r.profile) ? r.profile[0] : r.profile))
    .filter((p): p is AvatarIdentity => !!p);
}

function isGoing(event: EventRow, viewerId: string): boolean {
  return event.rsvps.some((r) => r.profile_id === viewerId && r.response === "going");
}

// Weekday / day / month in club wall-clock time, same zone lib/events reasons in.
function dateParts(iso: string): { weekday: string; day: string; month: string } {
  const d = new Date(iso);
  return {
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: CLUB_TIMEZONE }),
    day: d.toLocaleDateString("en-US", { day: "numeric", timeZone: CLUB_TIMEZONE }),
    month: d.toLocaleDateString("en-US", { month: "short", timeZone: CLUB_TIMEZONE }),
  };
}

function FeaturedEvent({ event, viewerId }: { event: EventRow; viewerId: string }) {
  const { day, month } = dateParts(event.starts_at);
  const going = goingPeople(event);
  const mine = isGoing(event, viewerId);
  return (
    <article className="bg-card flex flex-col gap-[22px] rounded-[24px] p-6 shadow-[inset_0_0_0_1px_var(--hairline-row)]">
      <Link href={`/events/${event.id}`} className="press flex flex-col gap-[22px]">
        <div className="flex items-start justify-between gap-3">
          <span className="eyebrow text-brass">
            Next up{event.source_name ? ` · ${event.source_name}` : ""}
          </span>
          <span className="flex flex-col items-end leading-none">
            <span className="text-muted-foreground text-[11px] font-medium tracking-[0.1em] uppercase">
              {month}
            </span>
            <span className="stat-number text-[30px] tracking-[-0.03em]">{day}</span>
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <h2 className="text-[24px] leading-[1.15] font-semibold tracking-[-0.02em]">{event.title}</h2>
          <span className="text-muted-foreground text-[14px] leading-normal">
            {formatEventWhen(event.starts_at, event.ends_at)}
            {event.location && (
              <>
                <br />
                {event.location}
              </>
            )}
          </span>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3">
        <AvatarStack people={going} caption={`${going.length} going`} />
        {mine ? (
          <Button asChild variant="ghost" size="sm" className="text-win">
            <Link href={`/events/${event.id}`}>Going</Link>
          </Button>
        ) : (
          <form action={setRsvp}>
            <input type="hidden" name="event_id" value={event.id} />
            <input type="hidden" name="response" value="going" />
            <SubmitButton size="sm" pendingChildren="Saving…">
              I&apos;m going
            </SubmitButton>
          </form>
        )}
      </div>
    </article>
  );
}

function EventRowLink({ event, viewerId, past }: { event: EventRow; viewerId: string; past: boolean }) {
  const { weekday, day } = dateParts(event.starts_at);
  const going = goingPeople(event).length;
  const mine = isGoing(event, viewerId);
  const status = past ? (mine ? "You went" : "Done") : mine ? "Going" : "RSVP";
  return (
    <ListRow
      href={`/events/${event.id}`}
      leading={
        <span className="flex w-10 flex-col items-start gap-1 leading-none">
          <span className="text-muted-foreground text-[11px] font-medium tracking-[0.1em] uppercase">
            {weekday}
          </span>
          <span className="stat-number text-[24px] tracking-[-0.03em]">{day}</span>
        </span>
      }
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{event.title}</span>
          {event.status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
        </span>
      }
      meta={
        <>
          {formatEventWhen(event.starts_at, event.ends_at)}
          {event.location && ` · ${event.location}`}
          {` · ${going} going`}
        </>
      }
      trailing={
        <span
          className={cn(
            "text-[12px] font-medium",
            past ? "text-muted-foreground" : mine ? "text-win" : "text-brass"
          )}
        >
          {status}
        </span>
      }
    />
  );
}

function Cups({ tournaments, admin }: { tournaments: TournamentRow[]; admin: boolean }) {
  return (
    <section className="flex flex-col">
      <SectionHeading>Cups</SectionHeading>
      {tournaments.length === 0 && <p className="text-muted-foreground py-6 text-sm">{EMPTY.cups}</p>}
      {tournaments.map((t) => {
        // A cup still being set up has nothing to show a member yet, and its
        // only page is admin-only — so don't offer them the click.
        const href =
          t.status === "setup" ? (admin ? `/tournaments/${t.id}/setup` : undefined) : `/tournaments/${t.id}`;
        return (
          <ListRow
            key={t.id}
            href={href}
            title={t.name}
            trailing={
              <span
                className={cn("text-[12px] font-medium", t.status === "live" ? "text-brass" : "text-muted-foreground")}
              >
                {STATUS_LABEL[t.status]}
              </span>
            }
          />
        );
      })}
    </section>
  );
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; tab?: string }>;
}) {
  const { message, error, tab: rawTab } = await searchParams;
  const tab: Tab = TABS.find((t) => t === rawTab) ?? "upcoming";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: events }, { data: tournaments }] = await Promise.all([
    supabase.from("profiles").select("role, schools(name, short_name)").eq("id", user.id).single(),
    supabase
      .from("events")
      .select(
        "id, title, location, starts_at, ends_at, status, source_name, rsvps(profile_id, response, profile:profiles(id, display_name, avatar_url, ball))"
      )
      .order("starts_at"),
    supabase.from("tournaments").select("id, name, status").order("created_at", { ascending: false }),
  ]);
  const school = Array.isArray(me?.schools) ? me.schools[0] : me?.schools;
  const admin = me?.role === "admin";

  const now = new Date();
  const { upcoming, past } = partitionEvents((events ?? []) as EventRow[], now);
  const list =
    tab === "past"
      ? past
      : tab === "going"
        ? upcoming.filter((e) => isGoing(e, user.id))
        : tab === "school" && school
          ? upcoming.filter((e) => eventMentionsSchool(e, school))
          : upcoming;
  const featured = tab === "upcoming" ? (upcoming[0] ?? null) : null;
  const rest = featured ? list.slice(1) : list;
  const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: CLUB_TIMEZONE });

  return (
    <main className="flex flex-col gap-7">
      <PageHeader overline={monthLabel} title="Events">
        {admin && (
          <div className="flex gap-2">
            <Button asChild size="sm" variant="ghost">
              <Link href="/events/new">New event</Link>
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link href="/tournaments/new">New tournament</Link>
            </Button>
          </div>
        )}
      </PageHeader>
      <UnderlineTabs
        ariaLabel="Event filter"
        value={tab}
        options={[
          { value: "upcoming", label: "Upcoming", href: "/events" },
          { value: "going", label: "Going", href: "/events?tab=going" },
          { value: "school", label: "My school", href: "/events?tab=school" },
          { value: "past", label: "Past", href: "/events?tab=past" },
          { value: "cups", label: "Cups", href: "/events?tab=cups" },
        ]}
      />

      {message && <p className="bg-card rounded-2xl p-3 text-sm">{message}</p>}
      {error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>}

      {tab === "cups" ? (
        <Cups tournaments={(tournaments ?? []) as TournamentRow[]} admin={admin} />
      ) : (
        <>
          {featured && <FeaturedEvent event={featured} viewerId={user.id} />}
          <section className="flex flex-col">
            <SectionHeading>{tab === "past" ? "Past" : "Coming up"}</SectionHeading>
            {rest.length === 0 && <p className="text-muted-foreground py-6 text-sm">{EMPTY[tab]}</p>}
            {rest.map((e) => (
              <EventRowLink key={e.id} event={e} viewerId={user.id} past={tab === "past"} />
            ))}
          </section>
        </>
      )}
    </main>
  );
}
