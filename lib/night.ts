// Club night, pure half (docs/superpowers/specs/2026-10-20-club-night-design.md §3):
// where you stand in the line, who keeps score, and who may run the night.

// A night nobody has touched for this long is over.
export const NIGHT_IDLE_MS = 6 * 3_600_000;

export interface Night {
  id: string;
  school_id: string;
  opened_by: string | null;
  tables: number;
  opened_at: string;
  touched_at: string;
  closed_at: string | null;
}

export interface LineRow {
  profile_id: string;
  joined_at: string;
}

// player_a joined the line first and keeps score.
export interface TableRow {
  table_no: number;
  player_a: string;
  player_b: string;
  called_at: string;
}

export type NightStatus =
  | { kind: "none" }
  | { kind: "out" }
  | { kind: "waiting"; position: number; ahead: number }
  | { kind: "playing"; tableNo: number; opponentId: string; keepsScore: boolean };

export function isNightOpen(night: Night | null, now: Date): boolean {
  if (!night || night.closed_at !== null) return false;
  return now.getTime() - Date.parse(night.touched_at) < NIGHT_IDLE_MS;
}

// The same order the database calls people in (_fill_tables): joined_at, then id.
export function lineOrder(line: LineRow[]): LineRow[] {
  return [...line].sort(
    (a, b) => Date.parse(a.joined_at) - Date.parse(b.joined_at) || a.profile_id.localeCompare(b.profile_id)
  );
}

export function tableSlots(tables: number, rows: TableRow[]): { tableNo: number; row: TableRow | null }[] {
  return Array.from({ length: tables }, (_, i) => ({
    tableNo: i + 1,
    row: rows.find((r) => r.table_no === i + 1) ?? null,
  }));
}

export function myNightStatus(night: Night | null, line: LineRow[], tables: TableRow[], meId: string, now: Date): NightStatus {
  if (!isNightOpen(night, now)) return { kind: "none" };
  const seat = tables.find((t) => t.player_a === meId || t.player_b === meId);
  if (seat) {
    const keepsScore = seat.player_a === meId;
    return { kind: "playing", tableNo: seat.table_no, opponentId: keepsScore ? seat.player_b : seat.player_a, keepsScore };
  }
  const index = lineOrder(line).findIndex((r) => r.profile_id === meId);
  if (index >= 0) return { kind: "waiting", position: index + 1, ahead: index };
  return { kind: "out" };
}

export function canManageNight(night: Night, meId: string, isAdmin: boolean): boolean {
  return isAdmin || night.opened_by === meId;
}

export function canFreeTable(row: TableRow, night: Night, meId: string, isAdmin: boolean): boolean {
  return row.player_a === meId || row.player_b === meId || canManageNight(night, meId, isAdmin);
}

function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

// The one line on the Home card and at the top of the night page.
export function nightCardLine(
  status: NightStatus,
  counts: { tables: number; waiting: number },
  opponentName: string | null
): string {
  if (status.kind === "waiting") {
    return status.position === 1 ? "You're next in line" : `You're ${ordinal(status.position)} in line`;
  }
  if (status.kind === "playing") {
    const name = opponentName ?? "your opponent";
    return status.keepsScore
      ? `You're up on table ${status.tableNo} vs ${name}`
      : `Table ${status.tableNo} vs ${name} — ${firstName(name)} keeps score`;
  }
  const tables = `${counts.tables} ${counts.tables === 1 ? "table" : "tables"}`;
  return `${tables} · ${counts.waiting === 0 ? "nobody" : counts.waiting} in line`;
}
