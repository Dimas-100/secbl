import Image from "next/image";

// The club wordmark, for screens with vertical room to give it.
//
// Deliberately NOT used in the member header: the letterforms are built from
// individual balls, and below roughly 40px tall they smear into noise. Small
// placements use the text wordmark in --primary instead.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/secbl-logo.png"
      alt="SECBL"
      width={800}
      height={598}
      priority
      className={className}
    />
  );
}
