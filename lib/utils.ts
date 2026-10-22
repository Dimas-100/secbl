import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// The gold edge: a brass hairline over a faint brass wash, for what needs you
// (Home's needs-you stack and the first-game card).
export const GOLD_EDGE =
  "rounded-[20px] p-4 bg-[color-mix(in_srgb,var(--brass)_8%,var(--card))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--brass)_55%,transparent)]"
