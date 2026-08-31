import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Where a password-reset email lands. Supabase hands back one of two things
// depending on how the link was opened:
//   token_hash — works even when the email is opened on a different device
//                than the one that asked for the reset
//   code       — the PKCE exchange, when it is the same browser throughout
// We accept both, because a member asking on their phone and clicking on a
// laptop is normal, and a flow that only handles `code` fails silently there.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");

  // Only ever redirect to our own paths — never to an attacker-supplied host.
  const requested = searchParams.get("next") ?? "/reset-password";
  const next = requested.startsWith("/") ? requested : "/reset-password";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  // Expired, already used, or malformed. Say so plainly rather than dumping
  // the raw Supabase error on a member.
  const message = "That link has expired or was already used. Request a new one.";
  return NextResponse.redirect(
    new URL(`/forgot-password?error=${encodeURIComponent(message)}`, request.url)
  );
}
