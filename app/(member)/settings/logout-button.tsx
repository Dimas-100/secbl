"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/(public)/login/actions";
import { removePushSubscription } from "./push-actions";

// Logging out also drops this browser's push subscription, so a shared
// device (a lab PC, a friend's phone) stops showing your messages the moment
// you leave. Best effort: a failure here never blocks the logout.
//
// The form submits twice by design: the first submit is intercepted to do
// the async cleanup, then re-submitted natively so the server action runs.
// The guard is a ref, not state, because the second submit event fires
// synchronously inside the first handler's closure.
export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const cleaned = useRef(false);
  return (
    <form
      action={logout}
      onSubmit={(e) => {
        if (cleaned.current) return; // native submit → server action
        e.preventDefault();
        const form = e.currentTarget;
        setBusy(true);
        (async () => {
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
          } finally {
            cleaned.current = true;
            form.requestSubmit();
          }
        })();
      }}
    >
      <Button variant="ghost" className="text-destructive w-full" disabled={busy}>
        {busy ? "Logging out…" : "Log out"}
      </Button>
    </form>
  );
}
