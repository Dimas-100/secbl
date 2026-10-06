import { redirect } from "next/navigation";
import { TabBar } from "@/components/tab-bar";
import { createClient } from "@/lib/supabase/server";

// The member shell is the auth gate plus the tab bar. Each screen renders
// its own header (PageHeader / MessagesButton), so there is no shared one.
export default async function MemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, status")
    .eq("id", user.id)
    .single();
  if (!profile || profile.status !== "approved") redirect("/pending");

  return (
    // w-full matters: body is a flex column, and a flex child with mx-auto
    // shrink-wraps its content instead of stretching.
    <div className="mx-auto w-full max-w-3xl px-6 pb-32">
      {children}
      <TabBar profileHref={`/players/${profile.id}`} />
    </div>
  );
}
