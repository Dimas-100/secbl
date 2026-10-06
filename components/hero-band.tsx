import { cn } from "@/lib/utils";

// The signature move: every member page opens with a felt band. Deep
// gradient, a soft light from the top-left, a fine grain. Pages overlap
// their first card onto it with -mt-3.
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
    <div className={cn("hero-gradient hero-grain -mx-4 rounded-b-[28px] px-5 pt-5 pb-8 text-white", className)}>
      <div className="relative z-10">
        {title && <h1 className="display text-[22px] leading-tight">{title}</h1>}
        {children}
      </div>
    </div>
  );
}
