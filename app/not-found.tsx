import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col items-center justify-center gap-4 px-4 text-center">
      <span className="stat-number text-primary text-7xl">404</span>
      <h1 className="text-2xl font-extrabold">That one&apos;s not on the table.</h1>
      <p className="text-muted-foreground text-sm">
        The page you&apos;re after doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
      <Button asChild size="lg" className="w-full">
        <Link href="/">Back home</Link>
      </Button>
    </main>
  );
}
