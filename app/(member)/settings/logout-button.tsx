"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(public)/login/actions";
import { removePushSubscription } from "./push-actions";

// Logging out also drops this browser's push subscription, so a shared
// device (a lab PC, a friend's phone) stops showing your messages the moment
// you leave. Best effort: a failure here never blocks the logout.
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <form
      action={logout}
      onSubmit={async (e) => {
        if (busy) return;
        e.preventDefault();
        setBusy(true);
        try {
          if ("serviceWorker" in navigator && "PushManager" in window) {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.getSubscription();
            if (sub) {
              await removePushSubscription(sub.endpoint);
              await sub.unsubscribe();
            }
          }
        } catch {
          // ignore — logging out matters more
        }
        (e.currentTarget as HTMLFormElement).requestSubmit();
      }}
    >
      <Button variant="ghost" className="text-destructive w-full" disabled={busy}>
        {busy ? "Logging out…" : "Log out"}
      </Button>
    </form>
  );
}
