import Link from "next/link";
import { ChevronLeft, X } from "lucide-react";
import { MessagesButton } from "@/components/messages-button";
import { cn } from "@/lib/utils";

// Every screen owns its header. Top-level tabs: overline + 32px title with the
// inbox icon on the right. Sub-pages: a ghost back (or close) button, a 17px
// centred title and whatever sits on the right — or a spacer so the title
// stays centred.
export function PageHeader({
  title,
  overline,
  back,
  backLabel = "Back",
  backIcon = "chevron",
  trailing,
  children,
  className,
}: {
  title: React.ReactNode;
  overline?: React.ReactNode;
  back?: string;
  backLabel?: string;
  backIcon?: "chevron" | "close";
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const right = trailing === undefined ? <MessagesButton /> : trailing;
  if (back) {
    const BackIcon = backIcon === "close" ? X : ChevronLeft;
    return (
      <header className={cn("flex flex-col gap-4 pt-3", className)}>
        <div className="flex items-center justify-between gap-3">
          <Link
            href={back}
            aria-label={backLabel}
            className="press flex size-11 shrink-0 items-center justify-center rounded-full shadow-[inset_0_0_0_1px_var(--hairline-strong)]"
          >
            <BackIcon className="size-5" strokeWidth={1.7} />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-center text-[17px] font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          {right ?? <span className="size-11 shrink-0" aria-hidden="true" />}
        </div>
        {children}
      </header>
    );
  }
  return (
    <header className={cn("flex flex-col gap-5 pt-3", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          {overline && <span className="overline">{overline}</span>}
          <h1 className="display truncate text-[32px] leading-none">{title}</h1>
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}
