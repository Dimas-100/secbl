import Link from "next/link";
import { redirect } from "next/navigation";
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

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28">
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
