"use client";

import { useOnline } from "@/components/presence-provider";
import { cn } from "@/lib/utils";

// The green dot on an avatar's corner for a member who has the app open
// right now. Draws nothing otherwise, and nothing at all outside the member
// shell (no provider → nobody is online).
export function OnlineDot({ id, size = 10, className }: { id: string; size?: number; className?: string }) {
  const online = useOnline(id);
  if (!online) return null;
  return (
    <span
      data-online-id={id}
      title="Online now"
      className={cn("bg-win ring-background absolute -right-px -bottom-px rounded-full ring-2", className)}
      style={{ width: size, height: size }}
    />
  );
}
