"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { RsvpResponse } from "@/lib/types";

const RESPONSES: RsvpResponse[] = ["going", "maybe", "no"];

// Tapping your current answer again clears the RSVP: "no" and "no answer" are
// different states, and members need a way back to the second one.
export async function setRsvp(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const eventId = String(formData.get("event_id") ?? "");
  const response = String(formData.get("response") ?? "") as RsvpResponse;
  if (!eventId || !RESPONSES.includes(response)) {
    redirect(`/events?error=${encodeURIComponent("That RSVP was not understood.")}`);
  }

  const { data: event } = await supabase
    .from("events")
    .select("id, status, starts_at, ends_at")
    .eq("id", eventId)
    .single();
  if (!event) {
    redirect(`/events?error=${encodeURIComponent("That event is no longer available.")}`);
  }
  if (event.status === "cancelled") {
    redirect(`/events/${eventId}?error=${encodeURIComponent("That event was cancelled.")}`);
  }
  const endsAt = new Date(event.ends_at ?? event.starts_at);
  if (endsAt.getTime() < Date.now()) {
    redirect(`/events/${eventId}?error=${encodeURIComponent("That event has already happened.")}`);
  }

  const { data: existing } = await supabase
    .from("rsvps")
    .select("response")
    .eq("event_id", eventId)
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existing?.response === response) {
    const { error } = await supabase
      .from("rsvps")
      .delete()
      .eq("event_id", eventId)
      .eq("profile_id", user.id);
    if (error) redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.from("rsvps").upsert(
      {
        event_id: eventId,
        profile_id: user.id,
        response,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id,profile_id" }
    );
    if (error) redirect(`/events/${eventId}?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}
