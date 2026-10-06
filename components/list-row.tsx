import Link from "next/link";
import { cn } from "@/lib/utils";

// The shared hairline row: leading visual, title + meta, trailing value.
// A link when it goes somewhere, a plain row otherwise. Rows divide with a
// bottom hairline; a parent can strip the last one with
// [&>*:last-child]:border-b-0.
export function ListRow({
  href,
  replace,
  leading,
  title,
  meta,
  trailing,
  className,
  ariaLabel,
}: {
  href?: string;
  replace?: boolean;
  leading?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center gap-3">{leading}</span>}
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate text-[15px] leading-tight font-medium">{title}</span>
        {meta && (
          <span className="text-muted-foreground truncate text-[12px] leading-tight">{meta}</span>
        )}
      </span>
      {trailing && (
        <span className="flex shrink-0 flex-col items-end gap-[3px] text-right">{trailing}</span>
      )}
    </>
  );
  const classes = cn(
    "border-hairline-row flex min-h-[68px] items-center gap-3.5 border-b py-3.5",
    href && "press",
    className
  );
  if (href) {
    return (
      <Link href={href} replace={replace} aria-label={ariaLabel} className={classes}>
        {body}
      </Link>
    );
  }
  return <div className={classes}>{body}</div>;
}
