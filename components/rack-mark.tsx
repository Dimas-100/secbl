import { rackSvg, type RackSvgOptions } from "@/lib/rack-mark";

// The SECBL mark in the page, drawn by the same function as every icon
// (lib/rack-mark.ts). Bare, it is cropped to the rack so it sits flush
// beside text. Decorative: whatever carries it names it.
export function RackMark({
  size,
  tile = "none",
  className,
}: {
  size: number;
  tile?: RackSvgOptions["tile"];
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{ display: "inline-flex", width: size, height: size }}
      // A fixed drawing from our own code, never user input.
      dangerouslySetInnerHTML={{ __html: rackSvg({ tile, size, fit: true }) }}
    />
  );
}
