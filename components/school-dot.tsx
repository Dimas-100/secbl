// A school's colour as a small dot. The colour is data (schools.primary_color),
// so this is the one place a non-token colour is painted.
export function SchoolDot({ color, size = 6 }: { color: string | null | undefined; size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, backgroundColor: color ?? "var(--muted-foreground)" }}
    />
  );
}
