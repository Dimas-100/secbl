"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// The night page is server-rendered; this asks for a fresh render whenever
// the night, the line or a table changes (someone joins, gets called, a table
// frees) or a table's score moves — debounced, and when the phone wakes.
// Same pattern as LiveHome: no second data model on the client.
export function LiveNight() {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 400);
    };
    // Unique topic per mount: the client is a singleton and removeChannel is async.
    const channel = supabase.channel(`night:${crypto.randomUUID()}`);
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      // Realtime needs the user's token to evaluate RLS for this subscriber.
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on("postgres_changes", { event: "*", schema: "public", table: "club_nights" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "night_line" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "night_tables" }, refresh)
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
