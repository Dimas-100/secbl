"use client";

import { useState } from "react";
import { Check, Share } from "lucide-react";

// Share this profile: the native sheet where it exists, the clipboard elsewhere.
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    } catch {
      // Cancelled share sheet — nothing to do.
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      aria-label={copied ? "Link copied" : "Share profile"}
      className="press flex size-10 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
    >
      {copied ? (
        <Check className="size-[18px]" strokeWidth={1.6} />
      ) : (
        <Share className="size-[18px]" strokeWidth={1.6} />
      )}
    </button>
  );
}
