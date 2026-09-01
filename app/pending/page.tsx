import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
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
    .select("status")
    .eq("id", user.id)
    .single();
  if (profile?.status === "approved") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <BrandLogo className="mx-auto h-auto w-44" />
      <h1 className="text-2xl font-bold">
        {profile?.status === "suspended"
          ? "Account suspended"
          : profile?.status === "rejected"
            ? "Not approved"
            : "Almost in"}
      </h1>
      <p className="text-muted-foreground">
        {profile?.status === "suspended"
          ? "Your account is suspended. Your match history is safe — talk to a club admin to get it lifted."
          : profile?.status === "rejected"
            ? "Your signup was not approved. Talk to a club admin if you think this is a mistake."
            : "Your account is waiting for admin approval. Check back soon."}
      </p>
      <form action={logout}>
        <button className="text-sm underline">Log out</button>
      </form>
    </main>
  );
}
