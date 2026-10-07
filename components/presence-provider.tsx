"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { onlineIds } from "@/lib/presence";

// Who has the app open right now. One Realtime presence channel for the
// whole club: every member screen joins it with the user's token, announces
// its own id, and keeps the set of ids it hears about. Nothing is stored —
// close the app and you drop off within a minute. Suspended members never
// get here: the member layout bounces them before this mounts.
const PresenceContext = createContext<ReadonlySet<string>>(new Set());

export function PresenceProvider({ meId, children }: { meId: string; children: ReactNode }) {
  const [online, setOnline] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const supabase = createClient();
    // Keyed by member id, so two tabs are one presence.
    const channel = supabase.channel("online", { config: { presence: { key: meId } } });
    let active = true;
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!active) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel
        .on("presence", { event: "sync" }, () => {
          setOnline(onlineIds(channel.presenceState()));
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") await channel.track({ id: meId });
        });
    })();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [meId]);

  return <PresenceContext.Provider value={online}>{children}</PresenceContext.Provider>;
}

export function useOnline(id: string): boolean {
  return useContext(PresenceContext).has(id);
}
