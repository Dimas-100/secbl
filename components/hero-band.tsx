import { cn } from "@/lib/utils";

// TEMPORARY (redesign plan, Task 3): a token-only stand-in for the retired
// felt band so the screens still awaiting their own pass (Home, Ranks, Chat,
// Profile) render on the dark tokens. Deleted in Task 10 once the last caller
// is rebuilt.
export function HeroBand({
  title,
  children,
  className,
}: {
  title?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 pt-3 pb-4", className)}>
      {title && <h1 className="display text-[32px] leading-none">{title}</h1>}
      {children}
    </div>
  );
}
