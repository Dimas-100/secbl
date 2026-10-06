"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Download, MoreVertical, PlusSquare, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type Platform = "ios" | "android" | "desktop";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// The two-tap install walkthrough, tailored to the phone that opened it.
// Android Chrome hands us a real install prompt; iOS has no API, so it gets
// the Share → Add to Home Screen steps with the exact icons.
// Browser-only facts read through useSyncExternalStore: the server renders
// the desktop/not-installed version, the client swaps in the truth without a
// hydration mismatch or a state update inside an effect.
const subscribeNever = () => () => {};
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return isIos ? "ios" : /Android/.test(ua) ? "android" : "desktop";
}
function detectStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export function InstallGuide() {
  const platform = useSyncExternalStore(subscribeNever, detectPlatform, () => "desktop" as Platform);
  const standalone = useSyncExternalStore(subscribeNever, detectStandalone, () => false);
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) {
    return (
      <div className="rounded-xl bg-card p-5 text-center shadow-[var(--shadow-card)]">
        <p className="font-semibold">You&apos;re already running the installed app.</p>
        <Button asChild className="mt-3 w-full" size="lg">
          <Link href="/">Open SECBL</Link>
        </Button>
      </div>
    );
  }

  if (installed) {
    return (
      <div className="rounded-xl bg-card p-5 text-center shadow-[var(--shadow-card)]">
        <p className="font-semibold">Installed. Look for the SECBL icon on your home screen.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {promptEvent && (
        <Button
          size="xl"
          variant="hero"
          className="w-full"
          onClick={async () => {
            await promptEvent.prompt();
            const { outcome } = await promptEvent.userChoice;
            if (outcome === "accepted") setInstalled(true);
            setPromptEvent(null);
          }}
        >
          <Download className="size-5" />
          Install SECBL
        </Button>
      )}

      <ol className="flex flex-col gap-3 rounded-xl bg-card p-5 shadow-[var(--shadow-card)]">
        {platform === "ios" && (
          <>
            <Step n={1} icon={<Share className="size-5" />}>
              Tap the <strong>Share</strong> button at the bottom of Safari.
            </Step>
            <Step n={2} icon={<PlusSquare className="size-5" />}>
              Scroll down and tap <strong>Add to Home Screen</strong>.
            </Step>
            <Step n={3} icon={<Smartphone className="size-5" />}>
              Tap <strong>Add</strong>. SECBL opens full screen from your home screen.
            </Step>
            <p className="text-muted-foreground text-xs">
              Opened this in Instagram or a chat app? Tap the ••• menu, choose <strong>Open in Safari</strong>, then follow the steps.
            </p>
          </>
        )}
        {platform === "android" && (
          <>
            <Step n={1} icon={<MoreVertical className="size-5" />}>
              {promptEvent ? (
                <>
                  Tap <strong>Install SECBL</strong> above, or open Chrome&apos;s <strong>⋮</strong> menu.
                </>
              ) : (
                <>
                  Open Chrome&apos;s <strong>⋮</strong> menu in the top corner.
                </>
              )}
            </Step>
            <Step n={2} icon={<PlusSquare className="size-5" />}>
              Tap <strong>Add to Home screen</strong> (or <strong>Install app</strong>).
            </Step>
            <Step n={3} icon={<Smartphone className="size-5" />}>
              Tap <strong>Install</strong>. SECBL gets its own icon and opens full screen.
            </Step>
          </>
        )}
        {platform === "desktop" && (
          <>
            <Step n={1} icon={<Smartphone className="size-5" />}>
              SECBL is built for your phone. Scan the code below with your camera to open it there.
            </Step>
            <Step n={2} icon={<Download className="size-5" />}>
              On a computer, Chrome and Edge show an install icon at the right end of the address bar.
            </Step>
          </>
        )}
      </ol>
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-sm">
      <span className="bg-primary text-primary-foreground stat-number flex size-7 shrink-0 items-center justify-center rounded-full text-xs">
        {n}
      </span>
      <span className="text-muted-foreground mt-1 shrink-0">{icon}</span>
      <span className="pt-1 leading-snug">{children}</span>
    </li>
  );
}
