// Pure helpers for the Play sheet (the tab bar's middle button), kept out of
// the component so vitest covers them without DOM tooling.

import { DRAFT_MAX_AGE_MS } from "@/lib/report-form";

export interface ResumableDraft {
  opponentId: string;
  you: number;
  them: number;
}

// The scoreboard's localStorage draft, if it is a game worth resuming: it
// parses, has an opponent picked, and is younger than the scoreboard's own
// 12-hour window. Only the fields the sheet shows are returned.
export function resumableDraft(raw: string | null, nowMs: number): ResumableDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Record<string, unknown> | null;
    if (!d || typeof d.opponentId !== "string") return null;
    if (typeof d.at !== "number" || !(nowMs - d.at < DRAFT_MAX_AGE_MS)) return null;
    const score = (v: unknown) => (typeof v === "number" ? v : 0);
    return { opponentId: d.opponentId, you: score(d.you), them: score(d.them) };
  } catch {
    return null;
  }
}

// "3–2 vs Jordan". U+2013 en dash between scores, matching the rest of the app.
export function resumeLine(d: ResumableDraft, opponentName: string): string {
  return `${d.you}–${d.them} vs ${opponentName.split(" ")[0]}`;
}

export const PLAY_FACES = 4;

// Who to show as quick-start faces: recent opponents first (deduped), then
// people from your school, then everyone else, each group alphabetical.
// Ids that are not in `members` are dropped.
export function playFaces(
  recentIds: string[],
  members: { id: string; school_id: string | null; display_name: string }[],
  mySchoolId: string | null,
  n = PLAY_FACES
): string[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const picked: string[] = [];
  const seen = new Set<string>();
  for (const id of recentIds) {
    if (byId.has(id) && !seen.has(id)) {
      picked.push(id);
      seen.add(id);
    }
  }
  const rest = members
    .filter((m) => !seen.has(m.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  const sameSchool = (m: { school_id: string | null }) => mySchoolId !== null && m.school_id === mySchoolId;
  const ordered = [...rest.filter(sameSchool), ...rest.filter((m) => !sameSchool(m))];
  return [...picked, ...ordered.map((m) => m.id)].slice(0, n);
}
