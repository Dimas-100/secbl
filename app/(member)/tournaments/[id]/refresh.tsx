"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// The bracket is server-rendered; while a tournament is live this pulls a fresh
// render every few seconds so spectators see results without a manual reload.
// Chosen over Supabase Realtime deliberately: no subscription to reconnect, no
// per-table enablement, and spectators cannot tell the difference.
export function LiveRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return null;
}
