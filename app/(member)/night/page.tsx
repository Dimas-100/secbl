import { redirect } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { EndNightButton } from "@/components/end-night-button";
import { ListRow } from "@/components/list-row";
import { LiveNight } from "@/components/live-night";
import { NightCard } from "@/components/night-card";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { SubmitButton } from "@/components/submit-button";
import { canFreeTable, canManageNight, lineOrder, tableSlots } from "@/lib/night";
import { loadNight } from "@/lib/night-data";
import { createClient } from "@/lib/supabase/server";
import { endNight, freeTable, setTables, startNight } from "./actions";

const TABLE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8];
const firstName = (name: string | null | undefined) => (name ?? "Member").trim().split(/\s+/)[0] || "Member";

// Club night (spec 2026-10-20-club-night §4): start the line, or see it —
// you, the tables, who's up next — and, for whoever started it, run it.
export default async function NightPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const now = new Date();
  const data = await loadNight(supabase, user.id, now);
  const { night } = data;
  const errorNote = error && <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>;

  if (!night) {
    return (
      <main className="flex flex-col gap-8">
        <PageHeader title="Club night" back="/" trailing={null} />
        {errorNote}
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Start the line when you get to the tables. Everyone joins from their phone; the app calls the next two to
          each free table.
        </p>
        <form action={startNight} className="flex flex-col gap-6">
          <div className="flex flex-col gap-3.5">
            <span className="eyebrow">Tables</span>
            <div className="bg-card grid grid-cols-8 gap-1 rounded-full p-1">
              {TABLE_CHOICES.map((n) => (
                <label
                  key={n}
                  className="text-muted-foreground has-checked:bg-primary has-checked:text-primary-foreground flex h-10 cursor-pointer items-center justify-center rounded-full text-[13px] font-medium has-checked:font-semibold"
                >
                  <input
                    type="radio"
                    name="tables"
                    value={n}
                    defaultChecked={n === 2}
                    aria-label={`${n} ${n === 1 ? "table" : "tables"}`}
                    className="sr-only"
                  />
                  {n}
                </label>
              ))}
            </div>
          </div>
          <SubmitButton size="xl" className="w-full" pendingChildren="Starting…">
            Start club night
          </SubmitButton>
        </form>
        <LiveNight />
      </main>
    );
  }

  const isAdmin = data.isAdmin;
  const hidden = <input type="hidden" name="night_id" value={night.id} />;
  const person = (id: string) => data.people.get(id) ?? { id, display_name: null };

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title="Club night" back="/" trailing={null} />
      {errorNote}

      <section className="flex flex-col gap-3">
        <span className="eyebrow flex items-center gap-2">
          <span aria-hidden="true" className="bg-win size-2 rounded-full motion-safe:animate-pulse" />
          You
        </span>
        <NightCard data={data} meId={user.id} back="/night" now={now} />
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Tables</SectionHeading>
        {tableSlots(night.tables, data.tables).map(({ tableNo, row }) => {
          if (!row) {
            return (
              <ListRow
                key={tableNo}
                leading={<span className="stat-number w-6 text-center text-[17px]">{tableNo}</span>}
                title={`Table ${tableNo}`}
                meta="Free"
              />
            );
          }
          const a = person(row.player_a);
          const b = person(row.player_b);
          const live = data.live.get(row.player_a);
          const score = live && live.opponent_id === row.player_b ? `${live.reporter_score}–${live.opponent_score}` : null;
          return (
            <ListRow
              key={tableNo}
              leading={
                <span className="flex items-center gap-3">
                  <span className="stat-number w-6 text-center text-[17px]">{tableNo}</span>
                  <span className="flex">
                    <Avatar person={a} size="sm" className="ring-background relative z-10 ring-2" />
                    <Avatar person={b} size="sm" className="ring-background -ml-2.5 ring-2" />
                  </span>
                </span>
              }
              title={`${row.player_a === user.id ? "You" : firstName(a.display_name)} vs ${row.player_b === user.id ? "you" : firstName(b.display_name)}`}
              meta={[score, `${row.player_a === user.id ? "You keep" : `${firstName(a.display_name)} keeps`} score`]
                .filter(Boolean)
                .join(" · ")}
              trailing={
                canFreeTable(row, night, user.id, isAdmin) ? (
                  <form action={freeTable}>
                    {hidden}
                    <input type="hidden" name="back" value="/night" />
                    <input type="hidden" name="table_no" value={tableNo} />
                    <SubmitButton variant="link" size="xs" className="text-muted-foreground" pendingChildren="Freeing…">
                      Free table
                    </SubmitButton>
                  </form>
                ) : null
              }
            />
          );
        })}
      </section>

      <section className="flex flex-col gap-1.5">
        <SectionHeading>Up next</SectionHeading>
        {data.line.length === 0 ? (
          <p className="text-muted-foreground py-4 text-sm">Nobody in line.</p>
        ) : (
          lineOrder(data.line).map((r, i) => (
            <ListRow
              key={r.profile_id}
              leading={
                <span className="flex items-center gap-3">
                  <span className="stat-number w-6 text-center text-[17px]">{i + 1}</span>
                  <Avatar person={person(r.profile_id)} size="sm" />
                </span>
              }
              title={r.profile_id === user.id ? "You" : (person(r.profile_id).display_name ?? "Member")}
            />
          ))
        )}
      </section>

      {canManageNight(night, user.id, isAdmin) && (
        <section className="border-hairline-divider flex flex-col gap-4 border-t pt-6">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[15px] font-medium">Tables tonight</span>
            <form action={setTables}>
              {hidden}
              <input type="hidden" name="tables" value={night.tables - 1} />
              <button
                type="submit"
                aria-label="Fewer tables"
                disabled={night.tables <= 1}
                className="press flex size-9 items-center justify-center rounded-full text-lg font-light shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40"
              >
                −
              </button>
            </form>
            <span className="stat-number w-5 text-center text-[17px]">{night.tables}</span>
            <form action={setTables}>
              {hidden}
              <input type="hidden" name="tables" value={night.tables + 1} />
              <button
                type="submit"
                aria-label="More tables"
                disabled={night.tables >= 8}
                className="press flex size-9 items-center justify-center rounded-full text-lg shadow-[inset_0_0_0_1px_var(--hairline-ghost)] disabled:opacity-40"
              >
                +
              </button>
            </form>
          </div>
          <form action={endNight}>
            {hidden}
            <EndNightButton waiting={data.line.length} playing={data.tables.length} />
          </form>
        </section>
      )}
      <LiveNight />
    </main>
  );
}
