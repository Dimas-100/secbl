"use client";

import { useState, type ReactNode } from "react";

// A list that shows its first `initial` items and a pill to reveal the rest
// in place. The items are already rendered (by the server, usually), so
// expanding costs no fetch and the hidden rows are exactly what would have
// been shown. `label` is a template — "{hidden}" and "{total}" are filled
// in here — because a server component cannot hand a function to a client one.
export function ShowMore({
  items,
  initial = 10,
  label = "Show {hidden} more",
}: {
  items: ReactNode[];
  initial?: number;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const hidden = items.length - initial;
  return (
    <>
      {open ? items : items.slice(0, initial)}
      {hidden > 0 && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press mx-auto mt-3 rounded-full px-4 py-2 text-[13px] font-medium shadow-[inset_0_0_0_1px_var(--hairline-ghost)]"
        >
          {label.replace("{hidden}", String(hidden)).replace("{total}", String(items.length))}
        </button>
      )}
    </>
  );
}
