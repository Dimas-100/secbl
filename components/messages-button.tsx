import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// The inbox entry point, top-right of every tab. One cheap RPC per render so
// the unread dot is right on every page, not just /chat.
export async function MessagesButton() {
  const supabase = await createClient();
  const { data: unreadRaw } = await supabase.rpc("unread_total");
  const unread = Number(unreadRaw ?? 0);
  return (
    <Link
      href="/chat"
      aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      className="press relative flex size-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
    >
      <MessageCircle className="size-5" strokeWidth={1.6} />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="bg-brass ring-background absolute top-2.5 right-2.5 size-[7px] rounded-full ring-2"
        />
      )}
    </Link>
  );
}
