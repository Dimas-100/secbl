"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { pushCalled, type CalledRow } from "@/lib/night-data";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Forms post back to the page they came from: Home's card or /night itself.
function backOf(formData: FormData): "/" | "/night" {
  return formData.get("back") === "/" ? "/" : "/night";
}

// The database functions own every rule and raise their refusals as the copy
// to show; only a lost race on the one-open-night index needs translating.
function friendly(message: string): string {
  return /duplicate key|unique/i.test(message) ? "A club night is already on." : message;
}

function refresh() {
  revalidatePath("/night");
  revalidatePath("/");
  revalidatePath("/events");
}

// Runs one night function as the member, pushes whoever it just called to a
// table, and returns to the page.
async function run(formData: FormData, fn: string, args: Record<string, unknown>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const back = backOf(formData);
  const night = String(formData.get("night_id") ?? "");
  if (!UUID_RE.test(night)) redirect(`${back}?error=${encodeURIComponent("That club night is over.")}`);
  const { data, error } = await supabase.rpc(fn, { p_night: night, ...args });
  if (error) redirect(`${back}?error=${encodeURIComponent(friendly(error.message))}`);
  await pushCalled(createServiceClient(), (Array.isArray(data) ? data : []) as CalledRow[], night, user.id);
  refresh();
  redirect(back);
}

export async function startNight(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const tables = Number(formData.get("tables") ?? 2);
  const { error } = await supabase.rpc("open_club_night", { p_tables: tables });
  if (error) redirect(`/night?error=${encodeURIComponent(friendly(error.message))}`);
  refresh();
  redirect("/night");
}

export async function setTables(formData: FormData) {
  await run(formData, "set_night_tables", { p_tables: Number(formData.get("tables")) });
}

export async function endNight(formData: FormData) {
  await run(formData, "close_club_night", {});
}

export async function joinLine(formData: FormData) {
  await run(formData, "join_night_line", {});
}

export async function leaveLine(formData: FormData) {
  await run(formData, "leave_night_line", {});
}

export async function freeTable(formData: FormData) {
  await run(formData, "free_night_table", { p_table_no: Number(formData.get("table_no")) });
}
