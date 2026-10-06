import { CardTitle } from "@/components/ui/card";

// Overline over a card body. Wraps CardTitle so every card keeps a real
// heading in the document outline.
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <CardTitle className="eyebrow">{children}</CardTitle>;
}
