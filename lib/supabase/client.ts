"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// The browser client, used only where the server cannot help: the Realtime
// subscription in a chat room, optimistic sends, and paging older messages.
// Everything it can reach is behind RLS; the anon key is public by design.
// Typed as the plain SupabaseClient: ReturnType of the generic factory
// collapses to `any` and takes every callback's parameter types with it.
let client: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return client;
}
