"use client";

import { Button } from "@/components/ui/button";

// Deleting cascades to every RSVP on the event and cannot be undone, so the
// admin gets one interstitial before it happens.
export function DeleteEventButton({ title }: { title: string }) {
  return (
    <Button
      size="sm"
      variant="destructive"
      type="submit"
      onClick={(event) => {
        const ok = window.confirm(
          `Delete "${title}"? This also deletes every RSVP for it and cannot be undone.`
        );
        if (!ok) event.preventDefault();
      }}
    >
      Delete
    </Button>
  );
}
