import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

// The frame every signed-out screen shares: the wordmark, an eyebrow, a
// display title and one line of copy, then whatever the screen is for. Same
// tokens and rhythm as the member screens, so the first thing a new member
// sees already looks like the app they are joining.
export function PublicShell({
  eyebrow = "SEC Billiards League",
  title,
  lead,
  children,
  className,
  compact = false,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-sm flex-col gap-7 px-6 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2rem+env(safe-area-inset-bottom))]",
        !compact && "justify-center",
        className
      )}
    >
      <header className="flex flex-col items-center gap-5 text-center">
        <BrandLogo className={cn("h-auto", compact ? "w-28" : "w-40")} />
        <div className="flex flex-col gap-2">
          <span className="eyebrow">{eyebrow}</span>
          <h1 className="display text-[30px] leading-[1.05]">{title}</h1>
          {lead && <p className="text-muted-foreground text-[14px] leading-normal">{lead}</p>}
        </div>
      </header>
      {children}
    </main>
  );
}

// A labelled field in the signed-out forms: eyebrow label over the input.
export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={htmlFor} className="eyebrow">
        {label}
      </label>
      {children}
      {hint && <p className="text-muted-foreground text-[12px]">{hint}</p>}
    </div>
  );
}
