import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ChatMessage } from "@/lib/chat";
import { ChatRoom, PAGE_SIZE } from "./chat-room";

interface MemberRow {
  profile_id: string;
  profile: { display_name: string } | { display_name: string }[] | null;
}

export default async function ChatRoomPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS hides channels you are not in, so a stranger's DM is simply a 404.
  const { data: channel } = await supabase
    .from("channels")
    .select("id, type, name, school_id")
    .eq("id", id)
    .single();
  if (!channel) notFound();

  const [{ data: members }, { data: latest }] = await Promise.all([
    supabase
      .from("channel_members")
      .select("profile_id, profile:profiles(display_name)")
      .eq("channel_id", id),
    supabase
      .from("messages")
      .select("id, channel_id, sender_id, body, client_id, created_at")
      .eq("channel_id", id)
      .order("id", { ascending: false })
      .limit(PAGE_SIZE),
  ]);

  const names: Record<string, string> = {};
  for (const m of (members ?? []) as MemberRow[]) {
    const p = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    if (p) names[m.profile_id] = p.display_name;
  }
  const others = ((members ?? []) as MemberRow[]).filter((m) => m.profile_id !== user.id);
  const title =
    channel.type === "dm" ? (names[others[0]?.profile_id] ?? "Member") : channel.name;
  const subtitle =
    channel.type === "everyone"
      ? `${(members ?? []).length} members · the whole league`
      : channel.type === "school"
        ? `${(members ?? []).length} members · school room`
        : "Direct message";

  const initialMessages = ((latest ?? []) as ChatMessage[]).slice().reverse();

  return (
    <ChatRoom
      channelId={id}
      channelType={channel.type}
      title={title}
      subtitle={subtitle}
      meId={user.id}
      initialMessages={initialMessages}
      initialNames={names}
    />
  );
}
