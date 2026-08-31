import { redirect } from "next/navigation";
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
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-bold">Almost in</h1>
      <p className="text-muted-foreground">
        {profile?.status === "rejected"
          ? "Your signup was not approved. Talk to a club admin if you think this is a mistake."
          : "Your account is waiting for admin approval. Check back soon."}
      </p>
      <form action={logout}>
        <button className="text-sm underline">Log out</button>
      </form>
    </main>
  );
}
