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
        <Link href="/" className="text-lg font-bold">
          SECBL
        </Link>
        <div className="flex items-center gap-3 text-sm">
          {profile.role === "admin" && (
            <Link href="/admin" className="underline">
              Admin
            </Link>
          )}
          <form action={logout}>
            <button className="text-muted-foreground underline">Log out</button>
          </form>
        </div>
      </header>
      {children}
      <nav className="bg-background fixed inset-x-0 bottom-0 border-t">
        <div className="mx-auto flex max-w-3xl justify-around py-3 text-sm">
          <Link href="/">Home</Link>
          <Link href="/leaderboard">Leaderboard</Link>
          <Link href="/schools">Schools</Link>
          <Link href="/matches/new">Report</Link>
        </div>
      </nav>
    </div>
  );
}
