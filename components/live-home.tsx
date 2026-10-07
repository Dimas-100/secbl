"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Home is server-rendered. This asks for a fresh render when a feed row
// lands or a live table changes, debounced so a burst costs one round trip,
// and when the phone comes back from sleep. No second data model: the
// server renders the same Home it would on a cold load.
export function LiveHome() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    // Unique topic per mount: the client is a singleton and removeChannel is
    // async, so a remount within one round trip would otherwise be handed
    // the channel that is still being torn down.
    const channel = supabase.channel(`home:${crypto.randomUUID()}`);
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      // Realtime needs the user's token to evaluate RLS for this subscriber.
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity" }, refresh)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "activity" }, refresh)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments" }, refresh)
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "comments" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "live_games" }, refresh)
        .subscribe();
    })();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
