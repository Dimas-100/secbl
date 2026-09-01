import { CardTitle } from "@/components/ui/card";

// The Sleek Broadcast section label: tiny letterspaced caps. Wraps CardTitle
// so every card keeps a real heading in the document outline.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <CardTitle className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </CardTitle>
  );
}
