import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PublicShell } from "@/components/public-shell";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(public)/login/actions";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles")
    .select("status, display_name, schools(name)")
    .eq("id", user.id)
    .single();
  if (profile?.status === "approved") redirect("/");
  const school = Array.isArray(profile?.schools) ? profile?.schools[0] : profile?.schools;

  const copy =
    profile?.status === "suspended"
      ? {
          eyebrow: "Account suspended",
          title: "You're on the bench.",
          lead: "Your match history is safe. Talk to a club admin to get it lifted.",
        }
      : profile?.status === "rejected"
        ? {
            eyebrow: "Not approved",
            title: "This signup wasn't approved.",
            lead: "Talk to a club admin if you think this is a mistake.",
          }
        : {
            eyebrow: "Almost in",
            title: `Welcome, ${(profile?.display_name ?? "there").split(" ")[0]}.`,
            lead: `Your account is waiting for admin approval${school?.name ? ` at ${school.name}` : ""}. It usually happens the same day — check back soon.`,
          };

  return (
    <PublicShell eyebrow={copy.eyebrow} title={copy.title} lead={copy.lead}>
      <div className="flex flex-col gap-3">
        <Button asChild size="xl" className="w-full">
          <Link href="/" prefetch={false}>
            Check again
          </Link>
        </Button>
        <form action={logout}>
          <Button variant="ghost" className="w-full">
            Log out
          </Button>
        </form>
      </div>
    </PublicShell>
  );
}
