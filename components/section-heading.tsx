import Link from "next/link";

// 17px section heading with an optional brass action on the right
// ("Recent · All games"). A real heading so the page keeps its outline.
export function SectionHeading({
  children,
  action,
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  action?: { href: string; label: string };
  as?: "h2" | "h3";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <Tag className="text-[17px] font-semibold tracking-[-0.01em]">{children}</Tag>
      {action && (
        <Link href={action.href} className="text-brass text-[13px]">
          {action.label}
        </Link>
      )}
    </div>
  );
}
