import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";

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
    <div className="mx-auto max-w-3xl px-4 pb-24 pt-4">
      <header className="mb-6 flex items-center justify-between">
        {/* Text, not the logo image: the wordmark's ball letterforms smear at
            header size. --primary carries the brand here instead. */}
        <Link href="/" className="text-primary text-lg font-bold tracking-tight">
          SECBL
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {profile.role === "admin" && (
            <Link href="/admin" className="underline">
              Admin
            </Link>
          )}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          <form action={logout}>
            <button className="text-muted-foreground underline">Log out</button>
          </form>
        </div>
      </header>
      {children}
      <nav className="bg-background fixed inset-x-0 bottom-0 border-t">
        <div className="mx-auto flex max-w-3xl justify-around py-3 text-sm">
          <Link href="/">Home</Link>
          <Link href="/events">Events</Link>
          <Link href="/leaderboard">Ranks</Link>
          <Link href="/schools">Schools</Link>
          <Link href="/matches/new">Report</Link>
        </div>
      </nav>
    </div>
  );
}
