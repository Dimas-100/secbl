"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens (or finds) the DM with another member and lands in it. The database
// function owns every rule — approved caller, approved target, not yourself,
// one room per pair — so this only validates the shape of the id.
export async function startDm(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const otherId = String(formData.get("profile_id") ?? "");
  if (!UUID_RE.test(otherId)) {
    redirect(`/chat?error=${encodeURIComponent("Pick a member to message.")}`);
  }
  const { data, error } = await supabase.rpc("get_or_create_dm", { p_other_id: otherId });
  if (error || !data) {
    redirect(
      `/chat?error=${encodeURIComponent(error?.message ?? "Could not start that conversation.")}`
    );
  }
  redirect(`/chat/${data}`);
}
