"use client";

import Link from "next/link";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintButton() {
  return (
    <div className="flex w-full gap-2 print:hidden">
      <Button size="lg" className="flex-1" onClick={() => window.print()}>
        <Printer className="size-4" />
        Print
      </Button>
      <Button asChild size="lg" variant="outline">
        <Link href="/install">Back</Link>
      </Button>
    </div>
  );
}
