"use client";

import { Button } from "@/components/ui/button";

// Ending the night clears the line and every table for everyone at the club,
// so it gets one interstitial first (same pattern as End season).
export function EndNightButton({ waiting, playing }: { waiting: number; playing: number }) {
  return (
    <Button
      type="submit"
      variant="outline"
      onClick={(event) => {
        const busy =
          waiting + playing > 0
            ? ` ${playing} table${playing === 1 ? " is" : "s are"} in play and ${waiting} ${waiting === 1 ? "person is" : "people are"} in line.`
            : "";
        if (!window.confirm(`End club night?${busy}`)) event.preventDefault();
      }}
    >
      End club night
    </Button>
  );
}
