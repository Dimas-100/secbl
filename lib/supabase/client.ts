"use client";

import { createBrowserClient } from "@supabase/ssr";

// The browser client, used only where the server cannot help: the Realtime
// subscription in a chat room, optimistic sends, and paging older messages.
// Everything it can reach is behind RLS; the anon key is public by design.
let client: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
