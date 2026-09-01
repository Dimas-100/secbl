export type MemberRole = "member" | "admin";
export type MemberStatus = "pending" | "approved" | "rejected" | "suspended";
export type GameType = "8ball" | "9ball" | "10ball" | "other";
export type MatchStatus = "pending" | "confirmed" | "rejected" | "disputed";

export interface School {
  id: string;
  name: string;
  short_name: string;
  primary_color: string;
  secondary_color: string;
}

export interface Profile {
  id: string;
  display_name: string;
  school_id: string;
  avatar_url: string | null;
  role: MemberRole;
  status: MemberStatus;
  rating: number;
  matches_played: number;
  created_at: string;
}

export interface Match {
  id: string;
  reporter_id: string;
  opponent_id: string;
  winner_id: string;
  reporter_score: number;
  opponent_score: number;
  game_type: GameType;
  status: MatchStatus;
  tournament_match_id: string | null;
  played_at: string;
  confirmed_at: string | null;
  rating_delta_reporter: number | null;
  rating_delta_opponent: number | null;
  created_at: string;
}

export type EventStatus = "scheduled" | "cancelled";
export type RsvpResponse = "going" | "maybe" | "no";

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  status: EventStatus;
  created_by: string;
  created_at: string;
}

export interface Rsvp {
  event_id: string;
  profile_id: string;
  response: RsvpResponse;
  created_at: string;
  updated_at: string;
}
