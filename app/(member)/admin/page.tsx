import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SectionLabel } from "@/components/section-label";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/submit-button";
import { SchoolLogoUploader } from "./school-logo-uploader";
import { formatEventWhen } from "@/lib/events";
import {
  addEventSource,
  adminRejectMatch,
  adminResolveMatch,
  approveProfile,
  reinstateProfile,
  rejectProfile,
  removeEventSource,
  suspendProfile,
  syncEventSourcesNow,
} from "./actions";

interface SourceRow {
  id: string;
  name: string;
  feed_url: string;
  enabled: boolean;
  last_synced_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_imported: number | null;
  schools: { short_name: string } | { short_name: string }[] | null;
}

interface MemberRow {
  id: string;
  display_name: string;
  status: string;
  schools: { short_name: string } | { short_name: string }[] | null;
}

function schoolCode(row: MemberRow): string | undefined {
  const school = Array.isArray(row.schools) ? row.schools[0] : row.schools;
  return school?.short_name;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
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
  if (me?.role !== "admin") redirect("/");

  const { data: pending } = await supabase
    .from("profiles")
    .select("id, display_name, created_at, schools(short_name)")
    .eq("status", "pending")
    .order("created_at");

  // Everyone who is in the club or was until they were suspended. Excludes the
  // signup queue above, and excludes you — self-suspension would lock the only
  // admin out of their own club.
  const { data: members } = await supabase
    .from("profiles")
    .select("id, display_name, status, schools(short_name)")
    .in("status", ["approved", "suspended"])
    .neq("id", user.id)
    .order("display_name");

  const [{ data: sources }, { data: schools }, { data: importedCount }] = await Promise.all([
    supabase
      .from("event_sources")
      .select("id, name, feed_url, enabled, last_synced_at, last_status, last_error, last_imported, schools(short_name)")
      .order("created_at"),
    supabase.from("schools").select("id, name, short_name, primary_color, logo_url").order("short_name"),
    supabase.from("events").select("source_id").not("source_id", "is", null),
  ]);
  const importedBySource = new Map<string, number>();
  for (const row of importedCount ?? []) {
    importedBySource.set(row.source_id, (importedBySource.get(row.source_id) ?? 0) + 1);
  }

  const { data: disputed } = await supabase
    .from("matches")
    .select(
      "id, reporter_score, opponent_score, game_type, played_at, reporter:profiles!matches_reporter_id_fkey(id, display_name), opponent:profiles!matches_opponent_id_fkey(id, display_name)"
    )
    .eq("status", "disputed")
    .order("created_at");

  return (
    <main>
      <PageHeader title="Admin" back="/settings" trailing={null} />
      <div className="mt-6 flex flex-col gap-6">
      {message && (
        <p className="bg-card rounded-2xl p-3 text-sm shadow-[inset_0_0_0_1px_var(--hairline-row)]">{message}</p>
      )}
      {error && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
      )}
      <Card>
        <CardHeader>
          <SectionLabel>Signup approvals</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {(pending ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No pending signups.</p>
          )}
          {(pending ?? []).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{p.display_name}</span>
                <Badge variant="secondary">
                  {Array.isArray(p.schools)
                    ? (p.schools as Array<{ short_name: string }>)[0]?.short_name
                    : (p.schools as { short_name: string })?.short_name}
                </Badge>
              </div>
              <div className="flex gap-2">
                <form action={approveProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button type="submit">
                    Approve
                  </Button>
                </form>
                <form action={rejectProfile}>
                  <input type="hidden" name="profile_id" value={p.id} />
                  <Button variant="outline" type="submit">
                    Reject
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Schools</SectionLabel>
        </CardHeader>
        <CardContent>
          <SchoolLogoUploader schools={schools ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Members</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {((members ?? []) as MemberRow[]).length === 0 && (
            <p className="text-sm text-muted-foreground">No other members yet.</p>
          )}
          {((members ?? []) as MemberRow[]).map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={m.status === "suspended" ? "text-muted-foreground" : "font-medium"}>
                  {m.display_name}
                </span>
                <Badge variant="secondary">{schoolCode(m)}</Badge>
                {m.status === "suspended" && <Badge variant="destructive">Suspended</Badge>}
              </div>
              {m.status === "suspended" ? (
                <form action={reinstateProfile}>
                  <input type="hidden" name="profile_id" value={m.id} />
                  <Button type="submit">
                    Reinstate
                  </Button>
                </form>
              ) : (
                <form action={suspendProfile}>
                  <input type="hidden" name="profile_id" value={m.id} />
                  <Button variant="outline" type="submit">
                    Suspend
                  </Button>
                </form>
              )}
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            Suspending revokes access and hides the member from leaderboards. Their
            matches, rating and history are kept, and reinstating restores everything.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Event sources</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Connect a school&apos;s involvement calendar and its events appear here automatically,
            with RSVPs in SECBL. Feeds sync every morning, or on demand. On PIN the feed is{" "}
            <code className="text-xs">pin.gsu.edu/organization/&lt;club&gt;/events.ics</code>.
          </p>
          {((sources ?? []) as SourceRow[]).map((s) => {
            const school = Array.isArray(s.schools) ? s.schools[0] : s.schools;
            return (
              <div key={s.id} className="flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-medium">{s.name}</span>
                    {school && <Badge variant="secondary">{school.short_name}</Badge>}
                    {s.last_status === "error" && <Badge variant="destructive">Error</Badge>}
                  </div>
                  <form action={removeEventSource}>
                    <input type="hidden" name="source_id" value={s.id} />
                    <Button variant="outline" size="sm" type="submit">
                      Remove
                    </Button>
                  </form>
                </div>
                <p className="text-muted-foreground truncate text-xs">{s.feed_url}</p>
                <p className="text-muted-foreground text-xs">
                  {s.last_synced_at
                    ? `Last sync ${formatEventWhen(s.last_synced_at, null)} · ${importedBySource.get(s.id) ?? 0} event(s) imported`
                    : "Not synced yet"}
                  {s.last_error && <span className="text-destructive"> · {s.last_error}</span>}
                </p>
              </div>
            );
          })}
          {(sources ?? []).length > 0 && (
            <form action={syncEventSourcesNow}>
              <SubmitButton size="sm" pendingChildren="Syncing…">
                Sync now
              </SubmitButton>
            </form>
          )}
          <form action={addEventSource} className="flex flex-col gap-3 border-t pt-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
              <label className="flex flex-col gap-1 text-xs">
                Name
                <Input name="name" placeholder="PIN" required maxLength={40} />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                Feed URL
                <Input
                  name="feed_url"
                  type="url"
                  required
                  placeholder="https://pin.gsu.edu/organization/pantherpool/events.ics"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs">
                School
                <select
                  name="school_id"
                  defaultValue=""
                  className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                >
                  <option value="">League-wide</option>
                  {(schools ?? []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.short_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SubmitButton className="self-start" pendingChildren="Connecting…">
              Connect feed
            </SubmitButton>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <SectionLabel>Disputed matches</SectionLabel>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {(disputed ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">No disputes.</p>
          )}
          {(disputed ?? []).map((m) => {
            const reporter = Array.isArray(m.reporter) ? m.reporter[0] : m.reporter;
            const opponent = Array.isArray(m.opponent) ? m.opponent[0] : m.opponent;
            return (
              <div key={m.id} className="flex flex-col gap-3 border-b pb-4 last:border-b-0">
                <p className="text-sm">
                  {reporter?.display_name} reported {m.reporter_score}–{m.opponent_score} vs{" "}
                  {opponent?.display_name} ({m.game_type}, {m.played_at}) — rejected by opponent.
                </p>
                <form action={adminResolveMatch} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="match_id" value={m.id} />
                  <label className="flex flex-col gap-1 text-xs">
                    Winner
                    <select
                      name="winner_id"
                      required
                      defaultValue=""
                      className="border-input h-9 rounded-md border bg-transparent px-3 text-sm"
                    >
                      <option value="" disabled>
                        Pick winner
                      </option>
                      <option value={reporter?.id}>{reporter?.display_name}</option>
                      <option value={opponent?.id}>{opponent?.display_name}</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {reporter?.display_name}
                    <Input
                      name="reporter_score"
                      type="number"
                      min={0}
                      defaultValue={m.reporter_score}
                      className="w-20"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    {opponent?.display_name}
                    <Input
                      name="opponent_score"
                      type="number"
                      min={0}
                      defaultValue={m.opponent_score}
                      className="w-20"
                    />
                  </label>
                  <Button type="submit">
                    Apply &amp; confirm
                  </Button>
                </form>
                <form action={adminRejectMatch}>
                  <input type="hidden" name="match_id" value={m.id} />
                  <Button variant="outline" type="submit">
                    Reject permanently
                  </Button>
                </form>
              </div>
            );
          })}
        </CardContent>
      </Card>
      </div>
    </main>
  );
}
