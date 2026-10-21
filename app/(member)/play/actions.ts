"use server";

import { redirect } from "next/navigation";
import { myNightStatus, nightCardLine } from "@/lib/night";
import { loadNight } from "@/lib/night-data";
import { playFaces } from "@/lib/play";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PlayPerson {
  id: string;
  display_name: string;
  avatar_url: string | null;
  ball: number | null;
}

export interface PlayNight {
  kind: "none" | "out" | "waiting" | "playing";
  nightId: string | null;
  line: string | null; // nightCardLine output; null when kind is "none"
  opponentId: string | null; // set when kind is "playing"
  keepsScore: boolean;
}

export interface PlaySheetData {
  night: PlayNight;
  faces: PlayPerson[];
  resume: PlayPerson | null;
}

const NO_NIGHT: PlayNight = { kind: "none", nightId: null, line: null, opponentId: null, keepsScore: false };

// Everything the tab bar's Play sheet shows (spec 2026-10-21-play-and-progress
// §1), fetched when it opens so no page's server render pays for it: where
// you stand at tonight's club night, the people you play, and the opponent of
// the scoreboard draft the client found in localStorage. Throws when the
// member list cannot be read, so the sheet offers a retry, not an empty sheet.
export async function loadPlaySheet(resumeOpponentId: string | null): Promise<PlaySheetData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const now = new Date();

  const [members, me, matches, nightData] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, avatar_url, ball, school_id")
      .eq("status", "approved")
      .neq("id", user.id),
    supabase.from("profiles").select("school_id").eq("id", user.id).single(),
    // The scoreboard's recency rule: whoever you actually play, any status.
    supabase
      .from("matches")
      .select("reporter_id, opponent_id")
      .or(`reporter_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(30),
    loadNight(supabase, user.id, now),
  ]);
  const failures = [members.error, me.error, matches.error].filter((e) => e !== null);
  if (failures.length > 0) {
    // The client only sees the generic message; the PostgREST cause goes to
    // the server log.
    console.error("loadPlaySheet: couldn't read", failures);
    throw new Error("Couldn't load the Play sheet");
  }

  const people = (members.data ?? []) as (PlayPerson & { school_id: string | null })[];
  const byId = new Map(people.map((p) => [p.id, p]));
  const toPerson = (id: string): PlayPerson | null => {
    const p = byId.get(id);
    return p ? { id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, ball: p.ball } : null;
  };

  const recentIds: string[] = (matches.data ?? []).map((m) =>
    m.reporter_id === user.id ? m.opponent_id : m.reporter_id
  );
  const faces = playFaces(recentIds, people, me.data?.school_id ?? null)
    .map(toPerson)
    .filter((p): p is PlayPerson => p !== null);

  let night = NO_NIGHT;
  if (nightData.night) {
    const status = myNightStatus(nightData.night, nightData.line, nightData.tables, user.id, now);
    if (status.kind !== "none") {
      const playing = status.kind === "playing" ? status : null;
      const opponent = playing ? (nightData.people.get(playing.opponentId) ?? null) : null;
      night = {
        kind: status.kind,
        nightId: nightData.night.id,
        line: nightCardLine(
          status,
          { tables: nightData.night.tables, waiting: nightData.line.length },
          opponent?.display_name ?? null
        ),
        opponentId: playing?.opponentId ?? null,
        keepsScore: playing?.keepsScore ?? false,
      };
    }
  }

  // The id comes from the client's localStorage: only a real member's counts.
  const resume =
    typeof resumeOpponentId === "string" && UUID_RE.test(resumeOpponentId) ? toPerson(resumeOpponentId) : null;

  return { night, faces, resume };
}
