/* eslint-disable @next/next/no-img-element */

export interface SchoolMarkSchool {
  short_name: string;
  primary_color: string | null;
  logo_url: string | null;
}

// A school's mark: its real logo when an admin has uploaded one, otherwise
// its colour as a dot (the one place a non-token colour is painted). Logos
// sit on a white disc, never recoloured: school marks are drawn for paper
// and several (navy, black) vanish straight onto the dark ground.
export function SchoolMark({
  school,
  size = 16,
  className,
}: {
  school: SchoolMarkSchool | null | undefined;
  size?: number;
  className?: string;
}) {
  if (school?.logo_url) {
    const pad = Math.max(1, Math.round(size * 0.12));
    return (
      <span
        aria-hidden="true"
        className={["inline-flex shrink-0 items-center justify-center rounded-full bg-white", className]
          .filter(Boolean)
          .join(" ")}
        style={{ width: size, height: size, padding: pad }}
      >
        <img
          src={school.logo_url}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          className="h-full w-full object-contain"
        />
      </span>
    );
  }
  const dot = Math.max(6, Math.round(size / 2));
  return (
    <span
      aria-hidden="true"
      className={["inline-flex shrink-0 items-center justify-center", className].filter(Boolean).join(" ")}
      style={{ width: size, height: size }}
    >
      <span
        className="block rounded-full"
        style={{ width: dot, height: dot, backgroundColor: school?.primary_color ?? "var(--muted-foreground)" }}
      />
    </span>
  );
}
