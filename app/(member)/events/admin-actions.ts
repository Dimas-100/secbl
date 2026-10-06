"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { clubTimeToISO, formatEventWhen } from "@/lib/events";
import { eventPayload } from "@/lib/push";
import { notify } from "@/lib/push-send";

// Every export here is admin-only. RLS is the real guard; this check gives the
// admin a redirect instead of an opaque policy failure.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: me } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (me?.role !== "admin") redirect("/events");
  return { supabase, user };
}

interface ParsedEvent {
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
}

function parseEventForm(formData: FormData): ParsedEvent | { error: string } {
  const title = String(formData.get("title") ?? "").trim();
  const startsLocal = String(formData.get("starts_at_local") ?? "");
  const endsLocal = String(formData.get("ends_at_local") ?? "");
  if (!title) return { error: "Give the event a title." };
  if (!startsLocal) return { error: "Give the event a start time." };

  const starts_at = clubTimeToISO(startsLocal);
  const ends_at = endsLocal ? clubTimeToISO(endsLocal) : null;
  if (ends_at && new Date(ends_at).getTime() <= new Date(starts_at).getTime()) {
    return { error: "The end time must be after the start time." };
  }

  const description = String(formData.get("description") ?? "").trim();
  const location = String(formData.get("location") ?? "").trim();
  return {
    title,
    description: description || null,
    location: location || null,
    starts_at,
    ends_at,
  };
}

export async function createEvent(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(`/events/new?error=${encodeURIComponent(parsed.error)}`);
  }
  const { data, error } = await supabase
    .from("events")
    .insert({ ...parsed, created_by: user.id })
    .select("id")
    .single();
  if (error || !data) {
    redirect(`/events/new?error=${encodeURIComponent(error?.message ?? "Could not create event")}`);
  }

  // Everyone who has events on hears about it; the creator does not.
  const service = createServiceClient();
  const { data: members } = await service.from("profiles").select("id").eq("status", "approved");
  await notify(service, {
    candidates: (members ?? []).map((m) => m.id as string),
    category: "events",
    excludeId: user.id,
    payload: eventPayload({
      eventId: data.id,
      title: parsed.title,
      when: formatEventWhen(parsed.starts_at, parsed.ends_at),
      location: parsed.location,
    }),
  });

  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${data.id}`);
}

export async function updateEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const parsed = parseEventForm(formData);
  if ("error" in parsed) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(parsed.error)}`);
  }
  const { error } = await supabase.from("events").update(parsed).eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function cancelEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const { error } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/events/${eventId}`);
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events/${eventId}`);
}

export async function deleteEvent(formData: FormData) {
  const { supabase } = await requireAdmin();
  const eventId = String(formData.get("event_id") ?? "");
  const { error } = await supabase.from("events").delete().eq("id", eventId);
  if (error) {
    redirect(`/events/${eventId}/edit?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/events");
  revalidatePath("/");
  redirect(`/events?message=${encodeURIComponent("Event deleted.")}`);
}
