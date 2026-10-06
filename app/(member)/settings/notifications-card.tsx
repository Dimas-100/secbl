"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Prefs } from "@/lib/push";
import { cn } from "@/lib/utils";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
  updateNotificationPrefs,
} from "./push-actions";

type Status = "checking" | "unsupported" | "blocked" | "off" | "on";

const CATEGORIES: { key: keyof Prefs; label: string; hint: string }[] = [
  { key: "messages", label: "Messages", hint: "DMs and the rooms you're in" },
  { key: "matches", label: "Matches", hint: "Games reported to you, confirmations, disputes" },
  { key: "events", label: "Events", hint: "New events on the calendar" },
];

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// One master switch (the push subscription itself) and three category
// switches. The subscription lives in the browser; the server only keeps a
// copy to send to, so turning it off here really does stop everything.
export function NotificationsCard({ initialPrefs }: { initialPrefs: Prefs }) {
  const [status, setStatus] = useState<Status>("checking");
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        if (!cancelled) setStatus("unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        if (!cancelled) setStatus("blocked");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (cancelled) return;
        if (sub) {
          // Refresh the server's copy so a re-installed browser is still reachable.
          void savePushSubscription(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }, navigator.userAgent);
          setStatus("on");
        } else {
          setStatus("off");
        }
      } catch {
        if (!cancelled) setStatus("off");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "blocked" : "off");
        return;
      }
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setNote("Notifications aren't configured on this server yet.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const result = await savePushSubscription(
        sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } },
        navigator.userAgent
      );
      if (result.error) {
        setNote(result.error);
        return;
      }
      setStatus("on");
    } catch (err) {
      console.error("push subscribe failed", err);
      setNote("Couldn't turn notifications on. On iPhone, add SECBL to your Home Screen first.");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setNote(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setNote("Couldn't turn notifications off. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: keyof Prefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const result = await updateNotificationPrefs(next);
    if (result.error) {
      setPrefs(prefs);
      setNote(result.error);
    }
  }

  async function test() {
    setBusy(true);
    setNote(null);
    const result = await sendTestPush();
    setNote(result.error ?? "Sent — it should arrive in a moment.");
    setBusy(false);
  }

  if (status === "checking") return <p className="text-muted-foreground text-sm">Checking this device…</p>;
  if (status === "unsupported") {
    return (
      <p className="text-muted-foreground text-sm">
        This browser can&apos;t receive notifications. On iPhone, add SECBL to your Home Screen first, then come back here.
      </p>
    );
  }
  if (status === "blocked") {
    return (
      <p className="text-muted-foreground text-sm">
        Notifications are blocked for this site. Allow them in your browser settings, then reload.
      </p>
    );
  }

  const on = status === "on";
  return (
    <div className="flex flex-col">
      <SwitchRow
        label="Push notifications"
        hint={on ? "On for this device" : "Off"}
        checked={on}
        disabled={busy}
        onChange={() => (on ? void turnOff() : void turnOn())}
      />
      {on &&
        CATEGORIES.map((c) => (
          <SwitchRow key={c.key} label={c.label} hint={c.hint} checked={prefs[c.key]} disabled={busy} onChange={() => void toggle(c.key)} />
        ))}
      {on && (
        <div className="pt-3">
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void test()}>
            Send a test
          </Button>
        </div>
      )}
      {note && (
        <p role="status" className="text-muted-foreground pt-2 text-[12px]">
          {note}
        </p>
      )}
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <div className="border-hairline-row flex items-center gap-3 border-b py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{label}</span>
        <span className="text-muted-foreground text-[12px]">{hint}</span>
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={onChange}
        className={cn(
          "press relative h-[26px] w-11 shrink-0 rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-brass" : "bg-secondary shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        )}
      >
        <span
          className={cn(
            "bg-background absolute top-[3px] size-5 rounded-full transition-[left]",
            checked ? "left-[21px]" : "left-[3px]"
          )}
        />
      </button>
    </div>
  );
}
