"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// The last line of defence. Anything that throws during render lands here
// instead of a blank screen, with a way back and a retry.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="text-5xl">🎱</span>
      <h1 className="text-2xl font-extrabold">Scratch.</h1>
      <p className="text-muted-foreground text-sm">
        Something went wrong on our end. Your data is safe — try again, or head home.
      </p>
      {error.digest && (
        <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>
      )}
      <div className="flex w-full flex-col gap-2">
        <Button onClick={reset} size="lg" className="w-full">
          Try again
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}
