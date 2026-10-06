"use client";

import Link from "next/link";
import { Printer, Share2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

// Print for the table, share for the group chat. Share uses the system sheet
// where there is one and falls back to copying the link.
export function PrintButton() {
  const [note, setNote] = useState<string | null>(null);
  async function share() {
    const url = `${window.location.origin}/install`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "SECBL", text: "Join the SEC Billiards League — track matches, climb the ladder.", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNote("Link copied.");
    } catch {
      // Cancelled share, or no clipboard: nothing to say.
    }
  }
  return (
    <div className="flex w-full flex-col gap-2 print:hidden">
      <div className="flex gap-2">
        <Button size="xl" className="flex-1" onClick={() => window.print()}>
          <Printer className="size-[18px]" />
          Print
        </Button>
        <Button size="xl" variant="outline" className="flex-1" onClick={() => void share()}>
          <Share2 className="size-[18px]" />
          Share
        </Button>
      </div>
      <Button asChild variant="ghost" size="sm">
        <Link href="/install">Back</Link>
      </Button>
      {note && (
        <p role="status" className="text-muted-foreground text-center text-[12px]">
          {note}
        </p>
      )}
    </div>
  );
}
