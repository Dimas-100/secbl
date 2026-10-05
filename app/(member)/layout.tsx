import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { TabBar } from "@/components/tab-bar";
import { createClient } from "@/lib/supabase/server";

export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, role, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "approved") redirect("/pending");
  // Header badge. One cheap RPC; the inbox icon is the chat entry point, so
  // the count has to be right on every page, not just /chat.
  const { data: unreadRaw } = await supabase.rpc("unread_total");
  const unread = Number(unreadRaw ?? 0);

  return (
    // w-full matters: body is a flex column, and a flex child with mx-auto
    // shrink-wraps its content instead of stretching — every page would size
    // to its longest text line without it.
    <div className="mx-auto w-full max-w-3xl px-4 pb-28">
      <header className="flex items-center justify-between py-3">
        {/* Text, not the logo image: the wordmark's ball letterforms smear at
            header size. --primary carries the brand here instead. */}
        <Link href="/" className="text-primary text-lg font-extrabold tracking-tight">
          SECBL
        </Link>
        <div className="flex items-center gap-3">
          {profile.role === "admin" && (
            <Badge asChild variant="outline">
              <Link href="/admin">Admin</Link>
            </Badge>
          )}
          {/* Chat lives up here, not in the tab bar: a sixth tab would push
              the raised Report button off center, and a top-right inbox icon
              with a badge is the convention students already know. */}
          <Link
            href="/chat"
            aria-label={unread > 0 ? `Chat, ${unread} unread` : "Chat"}
            className="text-primary relative flex size-10 items-center justify-center rounded-full hover:bg-accent"
          >
            <MessageCircle className="size-6" />
            {unread > 0 && (
              <span className="bg-gold text-gold-foreground stat-number absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ring-2 ring-background">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </Link>
          {/* Settings (and Log out, which lives there now) behind the avatar. */}
          <Link
            href="/settings"
            aria-label="Settings"
            className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full text-sm font-bold"
          >
            {(profile.display_name ?? "?")[0]?.toUpperCase()}
          </Link>
        </div>
      </header>
      {children}
      <TabBar />
    </div>
  );
}
