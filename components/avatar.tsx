import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-sm",
  lg: "size-12 text-lg",
} as const;

// Initial-letter avatar. No photos in v1, so the letter does the recognising;
// the accent tint marks the viewer themselves wherever they appear.
export function Avatar({
  name,
  size = "md",
  me = false,
  className,
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  me?: boolean;
  className?: string;
}) {
  const initial = (name ?? "?").trim()[0]?.toUpperCase() ?? "?";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold",
        me ? "bg-primary text-primary-foreground" : "bg-accent text-accent-foreground",
        SIZES[size],
        className
      )}
    >
      {initial}
    </span>
  );
}
