import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { clubDateOf } from "@/lib/events";
import { createClient } from "@/lib/supabase/server";
import { ReportMatchForm, type OpponentOption } from "./report-form";

export default async function NewMatchPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: opponents } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, ball, schools(short_name)")
    .eq("status", "approved")
    .neq("id", user.id)
    .order("display_name");

  // Recency drives the opponent chips: whoever you actually play, any status.
  const { data: myMatches } = await supabase
    .from("matches")
    .select("reporter_id, opponent_id, created_at")
    .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
    .order("created_at", { ascending: false })
    .limit(30);
  const recentIds = (myMatches ?? []).map((m) =>
    m.reporter_id === user.id ? m.opponent_id : m.reporter_id
  );

  const options: OpponentOption[] = (opponents ?? []).map((o) => {
    const school = Array.isArray(o.schools) ? o.schools[0] : o.schools;
    return {
      id: o.id,
      display_name: o.display_name,
      avatar_url: o.avatar_url,
      ball: o.ball,
      school: school?.short_name ?? null,
    };
  });

  const today = clubDateOf(new Date().toISOString());

  return (
    <main>
      <PageHeader title="Log a game" back="/" backIcon="close" backLabel="Close" trailing={null} />
      {/* No -mt-3 overlap here: the first element is a bare section label,
          not a card, and muted text on the band's green is unreadable. */}
      <div className="mt-6 flex flex-col gap-6">
        {error && (
          <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{error}</p>
        )}
        <ReportMatchForm opponents={options} recentIds={recentIds} today={today} />
      </div>
    </main>
  );
}
