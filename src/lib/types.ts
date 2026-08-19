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
  /** One v one, each plays their own ball. Day 4. */
  | 'singles'
  /** Two players a side, one ball, best shot taken each time. Day 3 (H1-6). */
  | 'two_man_scramble'
  /**
   * Two players a side. Both tee off, the pair takes the better drive, then
   * each plays their OWN ball in from there. The lower net of the two counts.
   * Day 3 (H7-12).
   *
   * Scoring is therefore per-player and best-net — the same shape as better
   * ball. What differs is only how the second shot is reached, which is a rule
   * for the players rather than something the engine can observe.
   */
  | 'shamble'
  /** Two players a side, one ball, alternating shots. */
  | 'foursomes';

/** How many players make up one side in each format. */
export const PLAYERS_PER_SIDE: Record<MatchFormat, number> = {
  team_scramble: 4,
  better_ball: 2,
  singles: 1,
  two_man_scramble: 2,
  shamble: 2,
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
  shamble: 'Shamble',
  foursomes: 'Alternate Shot',
};

export const FORMAT_SHORT_LABELS: Record<MatchFormat, string> = {
  team_scramble: 'Scramble',
  better_ball: 'Better Ball',
  singles: 'Singles',
  two_man_scramble: 'Scramble',
  shamble: 'Shamble',
  foursomes: 'Alt. Shot',
};

// ---------------------------------------------------------------------------
// Handicap allowances
// ---------------------------------------------------------------------------

/**
 * How a side's playing handicap is derived from its players' course handicaps.
 *
 * Most of these are editable in Admin -> Handicap Rules. Four are NOT — see
 * `FIXED_ALLOWANCES` below.
 */
export interface HandicapAllowance {
  /**
   * Percentage applied to each player's course handicap, ordered from the
   * LOWEST course handicap to the highest. e.g. `[0.5, 0.5]` rounded down is
   * this tour's pair allowance — floor((CH1 + CH2) / 2) for a scramble or a
   * shamble.
   *
   * For per-player formats (singles, better ball) the first entry applies to
   * every player individually; this tour uses 100% for both.
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
    // Unused by this tour's rounds but kept so the format stays selectable.
    team_scramble: { weights: [0.2, 0.15, 0.1, 0.05], rounding: 'nearest' },
    // Better ball: 100% of each player's own course handicap. The lowest
    // player in the match then plays off scratch and the rest take the
    // difference, which is `handicapMode: 'difference'` below.
    better_ball: { weights: [1], rounding: 'nearest' },
    // Singles: 100% each, lower player off scratch.
    singles: { weights: [1], rounding: 'nearest' },
    // Two-man scramble and shamble share one team handicap:
    //
    //     floor((CH1 + CH2) / 2)
    //
    // which is what a 50/50 split with `floor` rounding computes. The lower
    // team then plays off scratch and the other receives the difference.
    two_man_scramble: { weights: [0.5, 0.5], rounding: 'floor' },
    shamble: { weights: [0.5, 0.5], rounding: 'floor' },
    // WHS foursomes match play allowance is 50% of combined course handicaps.
    foursomes: { weights: [0.5, 0.5], rounding: 'nearest' },
  },
};

/**
 * The four formats whose allowance is a TOURNAMENT RULE, not a setting.
 *
 * These are fixed in code on purpose. They were previously read from
 * `tour.settings.allowances`, which is persisted — in Postgres for the real
 * tour, in localStorage for a demo device. That meant a record written before
 * the rules were agreed silently kept overriding them: a scoreboard showing a
 * 2-man scramble pair off `Team 9` instead of `Team 20` with nothing in the
 * code wrong, and nothing on screen to say why.
 *
 * A stale record cannot change the scoring if the scoring never reads it. So
 * `allowanceFor` below returns these regardless of what is stored, and
 * regardless of any per-match `allowanceOverride` — an override is persisted
 * data too, and carries exactly the same risk.
 *
 *   2-man scramble  floor((CH1 + CH2) / 2)   one team handicap for the pair
 *   shamble         floor((CH1 + CH2) / 2)   likewise — both balls net against it
 *   better ball     100% each                lowest player in the match off zero
 *   singles         100% each                lower player off zero
 *
 * `team_scramble` and `foursomes` are NOT here. Neither is used by this tour's
 * rounds, so no rule has been agreed for them and they stay editable.
 */
export const FIXED_ALLOWANCES: Partial<Record<MatchFormat, HandicapAllowance>> = {
  two_man_scramble: { weights: [0.5, 0.5], rounding: 'floor' },
  shamble: { weights: [0.5, 0.5], rounding: 'floor' },
  better_ball: { weights: [1], rounding: 'nearest' },
  singles: { weights: [1], rounding: 'nearest' },
};

/** How each fixed rule reads in plain words, for the screens that show it. */
export const FIXED_ALLOWANCE_HELP: Partial<Record<MatchFormat, string>> = {
  two_man_scramble:
    'The pair play off one team handicap: floor((CH1 + CH2) / 2). The lower pair play off zero and the higher receive the difference.',
  shamble:
    'The pair play off one team handicap: floor((CH1 + CH2) / 2). Each finishes their own ball, but both balls net against that same handicap.',
  better_ball:
    '100% of each player’s own course handicap. The lowest player in the match plays off zero and the other three receive the difference.',
  singles: '100% of each player’s own course handicap. The lower player plays off zero.',
};

/** True when this format's allowance is a fixed rule rather than a setting. */
export function isFixedAllowance(format: MatchFormat): boolean {
  return FIXED_ALLOWANCES[format] !== undefined;
}

/**
 * The allowance actually in force for a match.
 *
 * A fixed rule wins over everything. Otherwise the match's own override wins
 * over the tour setting, which is the behaviour the editable formats had.
 */
export function allowanceFor(
  format: MatchFormat,
  settings: TourSettings,
  allowanceOverride: HandicapAllowance | null = null,
): HandicapAllowance {
  return FIXED_ALLOWANCES[format] ?? allowanceOverride ?? settings.allowances[format];
}

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
  /** Leads one team's line-up decisions. Nothing to do with app permissions. */
  isCaptain: boolean;
  /**
   * Runs the tour and owns the app.
   *
   * This is a LABEL, not an access check — admin access is granted by typing
   * the `ADMIN_PIN` at sign-in, and always has been. It exists so the app can
   * say who the organiser is without implying that captains are the only
   * people who may hold the admin PIN.
   */
  isOrganiser: boolean;
  /** Handicaps Network Africa membership number. Null until supplied. */
  hnaId: string | null;
  /** WHS Handicap Index. Null means "not yet known" — admin must fill it in. */
  handicapIndex: number | null;
  handicapSource: HandicapSource;
  handicapUpdatedAt: string | null;
  photoUrl: string | null;
  sortOrder: number;
}

/** Whether hole distances are recorded in yards or metres. */
export type DistanceUnit = 'yards' | 'metres';

export interface Tee {
  id: string;
  courseId: string;
  name: string;
  colour: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  yardage: number | null;
  /** European cards are often in metres; this keeps the label honest. */
  distanceUnit: DistanceUnit;
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
   * Which nines are played and in what order, where the club has more than
   * one loop — e.g. "Queen's loop (1–9), then Prince's loop (10–18)". Null
   * when the course is a single fixed 18.
   */
  routing: string | null;
  /**
   * The two loop names, front nine first, so the scorecard can label its
   * halves exactly rather than guessing from `routing`. Null for a course
   * with one fixed 18.
   */
  nineNames: string[] | null;
  /**
   * False until a human has checked the par / stroke index / rating data
   * against the real scorecard. The app shows a warning while this is false.
   * Only ever set to true by an explicit "Mark course as verified" action —
   * never automatically, and never by the scorecard photo extractor.
   */
  dataVerified: boolean;
  /** When the course was verified, and by whom. */
  verifiedAt: string | null;
  verifiedBy: string | null;
  /** Where the data came from: "photo of the card at the pro shop", etc. */
  sourceNotes: string | null;
  /** The most recently uploaded scorecard photo, kept for reference. */
  scorecardImageId: string | null;
}

/** An uploaded photo of an official scorecard, kept against the course. */
export interface CourseScorecardImage {
  id: string;
  courseId: string;
  /** Data URL (`data:image/jpeg;base64,...`). Downscaled before upload. */
  imageData: string;
  mimeType: string;
  uploadedBy: string;
  notes: string | null;
  createdAt: string;
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

/**
 * A 4-ball: who physically walks round together.
 *
 * Deliberately NOT the same thing as a `Match`. A 4-ball is the group that tees
 * off together; a match is who is competing against whom. Sometimes they line
 * up exactly — a better-ball 4-ball is also one match — and sometimes they do
 * not: a Day 4 singles 4-ball contains two separate matches, and on Day 3 the
 * group stays put for 18 holes while the competitive format changes three
 * times underneath it.
 *
 * Keeping them in separate tables is what lets the group be edited by any
 * player without touching the competitive structure, which is admin-only.
 */
export interface RoundGroup {
  id: string;
  roundId: string;
  /** "4-Ball 1". Free text so a group can be renamed. */
  name: string;
  playerIds: string[];
  sortOrder: number;
  /** Who last changed it, so the round can show "updated by Alan". */
  updatedBy: string;
  updatedAt: string;
  /**
   * When someone confirmed these 4-balls for the round, and who. Null while
   * they are still a draft. One person confirming is enough — this is a stamp,
   * not an approval workflow.
   */
  confirmedAt: string | null;
  confirmedBy: string | null;
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
  /**
   * Handicap allowance for THIS match only. Null means "use the tour default
   * for this format" (Admin -> Rules), which is what almost every match wants.
   *
   * It exists so one hole range can be given its own allowance without
   * changing every other match played in the same format — e.g. running the
   * Day 3 scramble off 35/15% while a later scramble uses something else.
   */
  allowanceOverride: HandicapAllowance | null;
  /**
   * When someone confirmed who is playing whom in this match, and who did.
   * Null while the pairing is still a draft.
   *
   * Held per match rather than per round so Day 3's three six-hole sections
   * can be confirmed independently — a section is just the matches sharing a
   * hole range.
   */
  pairingsConfirmedAt: string | null;
  pairingsConfirmedBy: string | null;
  status: MatchStatusValue;
  sortOrder: number;
}

/**
 * The allowance actually in force for a match: the fixed tournament rule for
 * its format if there is one, otherwise its own override, otherwise the tour
 * default.
 *
 * Everything that displays or computes strokes goes through this, so the
 * scorecard can never show one allowance while the engine applies another.
 */
export function allowanceForMatch(
  match: Pick<Match, 'format' | 'allowanceOverride'>,
  settings: TourSettings,
): HandicapAllowance {
  return allowanceFor(match.format, settings, match.allowanceOverride);
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
  /** Physical playing groups. Separate from `matches` on purpose. */
  groups: RoundGroup[];
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

/**
 * Who this device is.
 *
 * There is no password and no permission level — the tour is private because
 * the link is private. All this records is which player is using the phone, so
 * scores and edits can say who made them.
 */
export interface Session {
  /** The player this device is signed in as, if they picked one. */
  playerId: string | null;
  playerName: string;
  issuedAt: number;
}
