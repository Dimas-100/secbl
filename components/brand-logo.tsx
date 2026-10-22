import { RackMark } from "@/components/rack-mark";
import { cn } from "@/lib/utils";

// The club lockup for the signed-out screens and the invitation: the rack
// mark, bare (the tile is for the app icon), beside the name in the app's own
// type. Drawn in code, so it stays sharp at any size; the name's colour
// follows the text, so the printed invitation inks it black.
export function BrandLogo({ size = "md", className }: { size?: "md" | "lg"; className?: string }) {
  const lg = size === "lg";
  return (
    <span role="img" aria-label="SECBL" className={cn("inline-flex items-center", lg ? "gap-3" : "gap-2.5", className)}>
      <RackMark size={lg ? 38 : 31} />
      <span aria-hidden="true" className={cn("font-semibold tracking-[-0.03em]", lg ? "text-[30px]" : "text-[24px]")}>
        SECBL
      </span>
    </span>
  );
}
