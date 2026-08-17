/**
 * Pars & Pirates Tour — domain model.
 *
 * These types mirror the Postgres schema in `supabase/migrations/0001_init.sql`
 * one-to-one. They are deliberately generic (Tour -> Round -> Match -> Score)
 * so the app can be reused for next year's tour rather than being hard-coded
 * to one weekend in Belek.
 */

// ---------------------------------------------------------------------------
// Formats
// ---------------------------------------------------------------------------

/** Every scoring format the engine understands. */
export type MatchFormat =
  /** One ball per team, four players, best shot taken each time. Day 1. */
  | 'team_scramble'
  /** Two players a side, each plays their own ball, lower net counts. Day 2. */
  | 'better_ball'
  /** One v one, each plays their own ball. Day 3 (H1-6) and Day 4. */
  | 'singles'
  /** Two players a side, one ball, best shot taken each time. Day 3 (H7-12). */
  | 'two_man_scramble'
  /** Two players a side, one ball, alternating shots. Day 3 (H13-18). */
  | 'foursomes';

/** How many players make up one side in each format. */
export const PLAYERS_PER_SIDE: Record<MatchFormat, number> = {
  team_scramble: 4,
  better_ball: 2,
  singles: 1,
  two_man_scramble: 2,
  foursomes: 2,
};

/**
 * Formats where the side records ONE score per hole (a single shared ball),
 * as opposed to formats where every player records their own score.
 */
export const TEAM_BALL_FORMATS: ReadonlySet<MatchFormat> = new Set<MatchFormat>([
  'team_scramble',
  'two_man_scramble',
  'foursomes',
]);

export function isTeamBallFormat(format: MatchFormat): boolean {
  return TEAM_BALL_FORMATS.has(format);
}

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  team_scramble: '4-Man Team Scramble',
  better_ball: 'Better Ball Match Play',
  singles: 'Singles Match Play',
  two_man_scramble: '2-Man Scramble',
  foursomes: 'Alternate Shot',
};

export const FORMAT_SHORT_LABELS: Record<MatchFormat, string> = {
  team_scramble: 'Scramble',
  better_ball: 'Better Ball',
  singles: 'Singles',
  two_man_scramble: 'Scramble',
  foursomes: 'Alt. Shot',
};

// ---------------------------------------------------------------------------
// Handicap allowances
// ---------------------------------------------------------------------------

/**
 * How a side's playing handicap is derived from its players' course handicaps.
 *
 * Every value here is editable in Admin -> Handicap Rules, because the spec
 * explicitly leaves the exact allowances as a pre-tour decision.
 */
export interface HandicapAllowance {
  /**
   * Percentage applied to each player's course handicap, ordered from the
   * LOWEST course handicap to the highest. e.g. `[0.35, 0.15]` is the common
   * 2-man scramble allowance (35% of the low handicap + 15% of the high).
   *
   * For per-player formats (singles, better ball) the first entry applies to
   * every player individually.
   */
  weights: number[];
  /** Rounding applied to the resulting playing handicap. */
  rounding: 'nearest' | 'floor' | 'ceil';
}

/**
 * Match-play handicapping style.
 * - `difference`: the lowest side plays off scratch and the other side receives
 *   the difference. This is standard match play and the default.
 * - `full`: every side plays its full allowance. Only differs from `difference`
 *   in how the scorecard displays strokes, not in the result.
 */
export type HandicapMode = 'difference' | 'full';

export interface TourSettings {
  /** Points awarded to the winner of a match. Spec default: 1. */
  pointsPerWin: number;
  /** Points awarded to EACH side when a match is halved. Spec default: 0.5. */
  pointsPerHalf: number;
  handicapMode: HandicapMode;
  /** Set false to play everything off scratch (gross). */
  handicapsEnabled: boolean;
  allowances: Record<MatchFormat, HandicapAllowance>;
  /** Completed holes are locked to non-admins once every side has scored. */
  lockCompletedHoles: boolean;
}

export const DEFAULT_TOUR_SETTINGS: TourSettings = {
  pointsPerWin: 1,
  pointsPerHalf: 0.5,
  handicapMode: 'difference',
  handicapsEnabled: true,
  lockCompletedHoles: true,
  allowances: {
    // 4-man scramble: a widely used allowance is 20/15/10/5% low-to-high.
    team_scramble: { weights: [0.2, 0.15, 0.1, 0.05], rounding: 'nearest' },
    // WHS four-ball match play allowance is 90%.
    better_ball: { weights: [0.9], rounding: 'nearest' },
    // WHS singles match play allowance is 100%.
    singles: { weights: [1], rounding: 'nearest' },
    // 2-man scramble: 35% of the low handicap + 15% of the high.
    two_man_scramble: { weights: [0.35, 0.15], rounding: 'nearest' },
    // WHS foursomes match play allowance is 50% of combined course handicaps.
    foursomes: { weights: [0.5, 0.5], rounding: 'nearest' },
  },
};

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Tour {
  id: string;
  name: string;
  year: number;
  startDate: string; // ISO date
  endDate: string; // ISO date
  location: string;
  status: 'upcoming' | 'live' | 'complete';
  winningTeamId: string | null;
  trophyName: string | null;
  settings: TourSettings;
}

export interface Team {
  id: string;
  tourId: string;
  name: string;
  shortName: string;
  /** Primary brand colour, used for tiles, bars and score chips. */
  colour: string;
  /** Lighter accent used for gradients and highlights. */
  accent: string;
  crest: string;
  captainPlayerId: string | null;
  sortOrder: number;
}

export type HandicapSource = 'manual' | 'hna';

export interface Player {
  id: string;
  tourId: string;
  teamId: string;
  name: string;
  nickname: string | null;
  initials: string;
  isCaptain: boolean;
  /** Handicaps Network Africa membership number. Null until supplied. */
  hnaId: string | null;
  /** WHS Handicap Index. Null means "not yet known" — admin must fill it in. */
  handicapIndex: number | null;
  handicapSource: HandicapSource;
  handicapUpdatedAt: string | null;
  photoUrl: string | null;
  sortOrder: number;
}

export interface Tee {
  id: string;
  courseId: string;
  name: string;
  colour: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  yardage: number | null;
}

export interface Hole {
  id: string;
  courseId: string;
  holeNo: number;
  par: number;
  /** 1..18, 1 being the hardest hole. Drives stroke allocation. */
  strokeIndex: number;
  /** Yardage per tee id. */
  yardages: Record<string, number>;
}

export interface Course {
  id: string;
  tourId: string;
  name: string;
  location: string | null;
  /** Optional link to the official published scorecard. Reference only. */
  sourceUrl: string | null;
  notes: string | null;
  /**
   * False until a human has checked the par / stroke index / rating data
   * against the real scorecard. The app shows a warning while this is false.
   */
  dataVerified: boolean;
}

export type RoundStatus = 'upcoming' | 'live' | 'complete';

export interface Round {
  id: string;
  tourId: string;
  /** 1..4 for golf days. Non-golf days do not get a round. */
  dayNo: number;
  name: string;
  date: string; // ISO date
  courseId: string;
  teeId: string;
  /** Human-readable summary; individual matches carry the real format. */
  formatLabel: string;
  teeTime: string | null; // HH:MM
  status: RoundStatus;
  notes: string | null;
  sortOrder: number;
}

export type MatchStatusValue = 'upcoming' | 'live' | 'complete';

export interface Match {
  id: string;
  roundId: string;
  name: string;
  format: MatchFormat;
  startHole: number;
  endHole: number;
  /** Points at stake. Defaults to the tour's pointsPerWin. */
  pointsValue: number;
  status: MatchStatusValue;
  sortOrder: number;
}

export interface MatchSide {
  id: string;
  matchId: string;
  teamId: string;
  playerIds: string[];
  /**
   * Manual override for this side's playing handicap. When null the engine
   * computes it from the players' handicap indexes and the format allowance.
   */
  handicapOverride: number | null;
  sortOrder: number;
}

export interface Score {
  id: string;
  matchId: string;
  holeNo: number;
  sideId: string;
  /** Null for shared-ball formats (scramble, foursomes). */
  playerId: string | null;
  /** Gross strokes. Null together with `pickedUp` means "not entered yet". */
  gross: number | null;
  /** Ball picked up / hole conceded — counts as no score for this ball. */
  pickedUp: boolean;
  enteredBy: string;
  updatedAt: string;
}

export interface MatchResult {
  matchId: string;
  winnerTeamId: string | null;
  pointsHome: number;
  pointsAway: number;
  /** e.g. "3&2", "2 UP", "Halved". */
  finalStatus: string;
  decidedOnHole: number | null;
  createdAt: string;
}

export type ItineraryCategory =
  | 'golf'
  | 'travel'
  | 'meal'
  | 'social'
  | 'ceremony'
  | 'sport'
  | 'rest'
  | 'admin';

export interface ItineraryItem {
  id: string;
  tourId: string;
  date: string; // ISO date
  startTime: string | null; // HH:MM
  endTime: string | null;
  title: string;
  location: string | null;
  details: string | null;
  category: ItineraryCategory;
  /** Links a schedule entry to the round it belongs to, for deep-linking. */
  roundId: string | null;
  sortOrder: number;
}

export type ActivityType =
  | 'hole_won'
  | 'match_start'
  | 'match_complete'
  | 'lead_change'
  | 'score_edit'
  | 'note';

export interface Activity {
  id: string;
  tourId: string;
  matchId: string | null;
  playerId: string | null;
  type: ActivityType;
  message: string;
  createdAt: string;
}

export interface Fine {
  id: string;
  tourId: string;
  playerId: string;
  reason: string;
  amount: number;
  status: 'open' | 'paid' | 'waived';
  createdAt: string;
}

/** Append-only audit log. Every score write lands here, nothing is deleted. */
export interface ScoreEvent {
  id: string;
  matchId: string;
  holeNo: number;
  sideId: string;
  playerId: string | null;
  gross: number | null;
  pickedUp: boolean;
  action: 'set' | 'clear';
  enteredBy: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// The whole tour in one object — what the client holds in memory
// ---------------------------------------------------------------------------

export interface TourSnapshot {
  tour: Tour;
  teams: Team[];
  players: Player[];
  courses: Course[];
  tees: Tee[];
  holes: Hole[];
  rounds: Round[];
  matches: Match[];
  sides: MatchSide[];
  scores: Score[];
  results: MatchResult[];
  itinerary: ItineraryItem[];
  activity: Activity[];
  fines: Fine[];
}

// ---------------------------------------------------------------------------
// Session / auth
// ---------------------------------------------------------------------------

export interface Session {
  /** The player this device is signed in as, if they picked one. */
  playerId: string | null;
  playerName: string;
  isAdmin: boolean;
  issuedAt: number;
}
