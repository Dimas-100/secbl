import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { createClient } from "@/lib/supabase/server";
import type { InboxRow } from "@/lib/chat";
import { buildInboxItems, type SchoolRef } from "@/lib/inbox";
import { InboxList } from "./inbox-list";
import { NewMessageSheet } from "./new-message-sheet";

const ERRORS: Record<string, string> = {
  pick: "Pick a member to message.",
  unavailable: "That member can't be messaged right now.",
  failed: "Couldn't start that conversation. Try again.",
};

export default async function ChatPage({
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

  const [{ data: inboxRows }, { data: members }, { data: schools }] = await Promise.all([
    supabase.rpc("list_my_channels"),
    supabase
      .from("profiles")
      .select("id, display_name, schools(short_name)")
      .eq("status", "approved")
      .neq("id", user.id)
      .order("display_name"),
    supabase.from("schools").select("id, short_name, primary_color, logo_url"),
  ]);
  const schoolsById: Record<string, SchoolRef> = Object.fromEntries(
    ((schools ?? []) as SchoolRef[]).map((s) => [s.id, s])
  );
  const items = buildInboxItems((inboxRows ?? []) as InboxRow[], {
    meId: user.id,
    now: new Date(),
    schoolsById,
  });
  const people = (members ?? []).map((m) => {
    const school = Array.isArray(m.schools) ? m.schools[0] : m.schools;
    return { id: m.id, display_name: m.display_name, school: school?.short_name ?? null };
  });

  return (
    <main className="flex flex-col gap-6">
      <PageHeader title="Messages" back="/" trailing={<NewMessageSheet people={people} />} />
      {error && ERRORS[error] && (
        <p className="bg-destructive/10 text-destructive rounded-2xl p-3 text-sm">{ERRORS[error]}</p>
      )}
      <InboxList rows={items} meId={user.id} schoolsById={schoolsById} />
      <p className="text-muted-foreground text-[12px]">
        Messages are plain text and visible to everyone in the room. DMs are private to the two of you.
      </p>
    </main>
  );
}
