"use client";

import { Button } from "@/components/ui/button";

// Ending a season crowns the champion and tells every member, so the admin
// gets one interstitial before it happens (same pattern as deleting an event).
export function EndSeasonButton({ name, pending }: { name: string; pending: number }) {
  return (
    <Button
      type="submit"
      variant="outline"
      onClick={(event) => {
        const warn =
          pending > 0
            ? ` ${pending} report${pending === 1 ? "" : "s"} still await confirmation and won't count until confirmed.`
            : "";
        const ok = window.confirm(`End ${name}? This crowns the champion and posts the final standings.${warn}`);
        if (!ok) event.preventDefault();
      }}
    >
      End season
    </Button>
  );
}
