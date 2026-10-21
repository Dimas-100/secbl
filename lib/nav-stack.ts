// A per-tab trail of the pages a member has visited, kept in sessionStorage
// by NavHistory (entries are pathname + search) so a sub-page's Back control can return to where they came
// from (spec 2026-10-21-play-and-progress §6). Pure helpers; no storage here.

export const NAV_KEY = "secbl:nav";
export const NAV_MAX = 50;

export function parseNavStack(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

// Same path as the top: no-op. Same path as the entry below the top: the
// browser went back, so pop. Anything else is a step forward.
export function nextNavStack(stack: string[], path: string): string[] {
  if (stack[stack.length - 1] === path) return stack;
  if (stack.length >= 2 && stack[stack.length - 2] === path) return stack.slice(0, -1);
  return [...stack, path].slice(-NAV_MAX);
}

export function canGoBack(stack: string[]): boolean {
  return stack.length >= 2;
}

// On the first run in a document, decide whether the stored trail belongs to
// this visit. A fresh navigation that did not come from one of our own pages
// (pasted URL, external site, push notification) must not inherit the trail,
// or Back could land on whatever the tab showed before. Reloads and
// back/forward keep it.
export function shouldResetStack(navType: string | undefined, referrer: string, origin: string): boolean {
  if (navType !== "navigate") return false;
  if (!referrer) return true;
  try {
    return new URL(referrer).origin !== origin;
  } catch {
    return true;
  }
}
