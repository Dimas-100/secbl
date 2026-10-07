"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { promptDecision, type PromptDecision } from "@/lib/push";
import {
  currentSubscription,
  isIos,
  isStandalone,
  pushPermission,
  pushSupported,
  subscribeToPush,
} from "@/lib/push-client";

const SNOOZE_KEY = "secbl:notify-snooze";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

// The one-tap notifications prompt on Home. Shown until the member turns
// notifications on, blocks them, or says "Not now" (which hides it for two
// weeks). On an iPhone in Safari it points at Home Screen install instead,
// because push only works from the installed app there.
export function NotifyPrompt() {
  const [decision, setDecision] = useState<PromptDecision | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let snoozedUntil: number | null = null;
      try {
        const raw = localStorage.getItem(SNOOZE_KEY);
        snoozedUntil = raw ? Number(raw) : null;
      } catch {
        snoozedUntil = null;
      }
      const subscribed = (await currentSubscription()) !== null;
      if (cancelled) return;
      setDecision(
        promptDecision({
          supported: pushSupported(),
          permission: pushPermission(),
          subscribed,
          snoozedUntil,
          now: Date.now(),
          ios: isIos(),
          standalone: isStandalone(),
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function snooze() {
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_MS));
    } catch {
      // ignore
    }
    setDecision("hide");
  }

  async function turnOn() {
    setBusy(true);
    setNote(null);
    const result = await subscribeToPush();
    setBusy(false);
    if (result.permission === "granted" && !result.error) {
      setDecision("hide");
      return;
    }
    if (result.permission === "denied") {
      setDecision("hide");
      return;
    }
    if (result.error) setNote(result.error);
  }

  if (!decision || decision === "hide") return null;

  return (
    <section
      aria-label="Notifications"
      className="bg-card relative flex items-start gap-3.5 rounded-[20px] p-4 pr-11 shadow-[inset_0_0_0_1px_var(--hairline-row)]"
    >
      <span className="bg-brass text-background flex size-10 shrink-0 items-center justify-center rounded-full">
        <BellRing className="size-[18px]" strokeWidth={1.8} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[15px] font-medium">
            {decision === "install" ? "Get notified on this iPhone" : "Know when it's your move"}
          </span>
          <span className="text-muted-foreground text-[13px] leading-snug">
            {decision === "install"
              ? "Add SECBL to your Home Screen first, then open it from there and turn notifications on."
              : "A game sent to you, a confirmation, a message in your room, a new event. You choose which."}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {decision === "install" ? (
            <Button asChild size="sm">
              <Link href="/install">How to add it</Link>
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => void turnOn()}>
              {busy ? "Turning on…" : "Turn on"}
            </Button>
          )}
          <button type="button" onClick={snooze} className="text-muted-foreground press text-[13px]">
            Not now
          </button>
        </div>
        {note && (
          <p role="status" className="text-muted-foreground text-[12px]">
            {note}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={snooze}
        aria-label="Dismiss"
        className="text-muted-foreground press absolute top-3 right-3 flex size-8 items-center justify-center rounded-full"
      >
        <X className="size-4" strokeWidth={1.8} />
      </button>
    </section>
  );
}
