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
  logo_url: string | null;
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
  // Format: null race_to = open play. Scores include the spot (the receiver
  // starts at `spot`), so winner_id is always the higher score.
  race_to: number | null;
  spot: number;
  spot_to: string | null;
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

export type TournamentFormat = "single_elim" | "double_elim";
export type TournamentStatus = "setup" | "live" | "complete";
export type BracketSide = "winners" | "losers" | "grand_final";

export interface Tournament {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  // Every match in the cup is a race to this many games.
  race_to: number;
  event_id: string | null;
  created_by: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

export interface TournamentPlayer {
  tournament_id: string;
  profile_id: string;
  seed: number;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  bracket: BracketSide;
  round: number;
  position: number;
  player1_id: string | null;
  player2_id: string | null;
  player1_score: number | null;
  player2_score: number | null;
  winner_id: string | null;
  winner_advances_to: string | null;
  winner_advances_slot: 1 | 2 | null;
  loser_advances_to: string | null;
  loser_advances_slot: 1 | 2 | null;
  created_at: string;
}
