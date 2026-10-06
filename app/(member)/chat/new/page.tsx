import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { dmKey } from "@/lib/chat";
import { ChatRoom } from "../[id]/chat-room";

// A draft conversation: looks like a room, has no row behind it. The DM is
// created by the first send (sendFirstDm), so backing out leaves nothing in
// anyone's inbox. If the pair already has a room, go straight there.
export default async function NewDmPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string }>;
}) {
  const { to } = await searchParams;
  if (!to || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(to)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (to === user.id) redirect("/chat?error=pick");

  const [{ data: other }, { data: existing }] = await Promise.all([
    supabase.from("profiles").select("id, display_name").eq("id", to).eq("status", "approved").maybeSingle(),
    // RLS only returns rooms you are in, so a hit means the DM exists.
    supabase.from("channels").select("id").eq("type", "dm").eq("dm_key", dmKey(user.id, to)).maybeSingle(),
  ]);
  if (!other) redirect("/chat?error=unavailable");
  if (existing) redirect(`/chat/${existing.id}`);

  return (
    <ChatRoom
      channelId={null}
      draftTo={other.id}
      channelType="dm"
      title={other.display_name}
      subtitle="Direct message"
      meId={user.id}
      initialMessages={[]}
      initialNames={{ [other.id]: other.display_name, [user.id]: "You" }}
    />
  );
}
