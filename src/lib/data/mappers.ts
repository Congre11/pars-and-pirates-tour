/**
 * Translation between Postgres rows (snake_case) and the domain model
 * (camelCase). Kept in one file so the schema and the types can only drift in
 * a single, obvious place.
 */

import {
  DEFAULT_TOUR_SETTINGS,
  type Activity,
  type Course,
  type Fine,
  type HandicapAllowance,
  type Hole,
  type ItineraryItem,
  type Match,
  type MatchResult,
  type MatchSide,
  type Player,
  type Round,
  type RoundGroup,
  type Score,
  type Team,
  type Tee,
  type Tour,
  type TourSettings,
} from '@/lib/types';

type Row = Record<string, unknown>;

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const nstr = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
};
const nnum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const bool = (v: unknown, fallback = false): boolean => (typeof v === 'boolean' ? v : fallback);

/** Merge stored settings over the defaults so a partial jsonb never breaks scoring. */
export function toTourSettings(value: unknown): TourSettings {
  const raw = (value ?? {}) as Partial<TourSettings>;
  return {
    ...DEFAULT_TOUR_SETTINGS,
    ...raw,
    allowances: { ...DEFAULT_TOUR_SETTINGS.allowances, ...(raw.allowances ?? {}) },
  };
}

export const fromTourRow = (r: Row): Tour => ({
  id: str(r.id),
  name: str(r.name),
  year: num(r.year),
  startDate: str(r.start_date),
  endDate: str(r.end_date),
  location: str(r.location),
  status: (str(r.status, 'upcoming') as Tour['status']) ?? 'upcoming',
  winningTeamId: nstr(r.winning_team_id),
  trophyName: nstr(r.trophy_name),
  settings: toTourSettings(r.settings),
});

export const toTourRow = (t: Partial<Tour>): Row => ({
  ...(t.id !== undefined && { id: t.id }),
  ...(t.name !== undefined && { name: t.name }),
  ...(t.year !== undefined && { year: t.year }),
  ...(t.startDate !== undefined && { start_date: t.startDate }),
  ...(t.endDate !== undefined && { end_date: t.endDate }),
  ...(t.location !== undefined && { location: t.location }),
  ...(t.status !== undefined && { status: t.status }),
  ...(t.winningTeamId !== undefined && { winning_team_id: t.winningTeamId }),
  ...(t.trophyName !== undefined && { trophy_name: t.trophyName }),
  ...(t.settings !== undefined && { settings: t.settings }),
});

export const fromTeamRow = (r: Row): Team => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  name: str(r.name),
  shortName: str(r.short_name),
  colour: str(r.colour, '#0f7a4d'),
  accent: str(r.accent, '#3ddc84'),
  crest: str(r.crest, '⛳'),
  captainPlayerId: nstr(r.captain_player_id),
  sortOrder: num(r.sort_order),
});

export const toTeamRow = (t: Partial<Team>): Row => ({
  ...(t.id !== undefined && { id: t.id }),
  ...(t.tourId !== undefined && { tour_id: t.tourId }),
  ...(t.name !== undefined && { name: t.name }),
  ...(t.shortName !== undefined && { short_name: t.shortName }),
  ...(t.colour !== undefined && { colour: t.colour }),
  ...(t.accent !== undefined && { accent: t.accent }),
  ...(t.crest !== undefined && { crest: t.crest }),
  ...(t.captainPlayerId !== undefined && { captain_player_id: t.captainPlayerId }),
  ...(t.sortOrder !== undefined && { sort_order: t.sortOrder }),
});

export const fromPlayerRow = (r: Row): Player => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  teamId: str(r.team_id),
  name: str(r.name),
  nickname: nstr(r.nickname),
  initials: str(r.initials),
  isCaptain: bool(r.is_captain),
  isOrganiser: bool(r.is_organiser),
  hnaId: nstr(r.hna_id),
  handicapIndex: nnum(r.handicap_index),
  handicapSource: (str(r.handicap_source, 'manual') as Player['handicapSource']) ?? 'manual',
  handicapUpdatedAt: nstr(r.handicap_updated_at),
  photoUrl: nstr(r.photo_url),
  sortOrder: num(r.sort_order),
});

export const toPlayerRow = (p: Partial<Player>): Row => ({
  ...(p.id !== undefined && { id: p.id }),
  ...(p.tourId !== undefined && { tour_id: p.tourId }),
  ...(p.teamId !== undefined && { team_id: p.teamId }),
  ...(p.name !== undefined && { name: p.name }),
  ...(p.nickname !== undefined && { nickname: p.nickname }),
  ...(p.initials !== undefined && { initials: p.initials }),
  ...(p.isCaptain !== undefined && { is_captain: p.isCaptain }),
  ...(p.isOrganiser !== undefined && { is_organiser: p.isOrganiser }),
  ...(p.hnaId !== undefined && { hna_id: p.hnaId }),
  ...(p.handicapIndex !== undefined && { handicap_index: p.handicapIndex }),
  ...(p.handicapSource !== undefined && { handicap_source: p.handicapSource }),
  ...(p.handicapUpdatedAt !== undefined && { handicap_updated_at: p.handicapUpdatedAt }),
  ...(p.photoUrl !== undefined && { photo_url: p.photoUrl }),
  ...(p.sortOrder !== undefined && { sort_order: p.sortOrder }),
});

export const fromCourseRow = (r: Row): Course => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  name: str(r.name),
  location: nstr(r.location),
  sourceUrl: nstr(r.source_url),
  notes: nstr(r.notes),
  routing: nstr(r.routing),
  nineNames: Array.isArray(r.nine_names) ? (r.nine_names as string[]) : null,
  dataVerified: bool(r.data_verified),
  verifiedAt: nstr(r.verified_at),
  verifiedBy: nstr(r.verified_by),
  sourceNotes: nstr(r.source_notes),
  scorecardImageId: nstr(r.scorecard_image_id),
});

export const toCourseRow = (c: Partial<Course>): Row => ({
  ...(c.id !== undefined && { id: c.id }),
  ...(c.tourId !== undefined && { tour_id: c.tourId }),
  ...(c.name !== undefined && { name: c.name }),
  ...(c.location !== undefined && { location: c.location }),
  ...(c.sourceUrl !== undefined && { source_url: c.sourceUrl }),
  ...(c.notes !== undefined && { notes: c.notes }),
  ...(c.routing !== undefined && { routing: c.routing }),
  ...(c.nineNames !== undefined && { nine_names: c.nineNames }),
  ...(c.dataVerified !== undefined && { data_verified: c.dataVerified }),
  ...(c.verifiedAt !== undefined && { verified_at: c.verifiedAt }),
  ...(c.verifiedBy !== undefined && { verified_by: c.verifiedBy }),
  ...(c.sourceNotes !== undefined && { source_notes: c.sourceNotes }),
  ...(c.scorecardImageId !== undefined && { scorecard_image_id: c.scorecardImageId }),
});

export const fromTeeRow = (r: Row): Tee => ({
  id: str(r.id),
  courseId: str(r.course_id),
  name: str(r.name),
  colour: str(r.colour, '#f2c53d'),
  courseRating: num(r.course_rating, 72),
  slopeRating: num(r.slope_rating, 113),
  par: num(r.par, 72),
  yardage: nnum(r.yardage),
  distanceUnit: (str(r.distance_unit, 'yards') as Tee['distanceUnit']) ?? 'yards',
});

export const toTeeRow = (t: Partial<Tee>): Row => ({
  ...(t.id !== undefined && { id: t.id }),
  ...(t.courseId !== undefined && { course_id: t.courseId }),
  ...(t.name !== undefined && { name: t.name }),
  ...(t.colour !== undefined && { colour: t.colour }),
  ...(t.courseRating !== undefined && { course_rating: t.courseRating }),
  ...(t.slopeRating !== undefined && { slope_rating: t.slopeRating }),
  ...(t.par !== undefined && { par: t.par }),
  ...(t.yardage !== undefined && { yardage: t.yardage }),
  ...(t.distanceUnit !== undefined && { distance_unit: t.distanceUnit }),
});

export const fromHoleRow = (r: Row): Hole => ({
  id: str(r.id),
  courseId: str(r.course_id),
  holeNo: num(r.hole_no),
  par: num(r.par, 4),
  strokeIndex: num(r.stroke_index, 1),
  yardages: (r.yardages as Record<string, number>) ?? {},
});

export const toHoleRow = (h: Partial<Hole>): Row => ({
  ...(h.id !== undefined && { id: h.id }),
  ...(h.courseId !== undefined && { course_id: h.courseId }),
  ...(h.holeNo !== undefined && { hole_no: h.holeNo }),
  ...(h.par !== undefined && { par: h.par }),
  ...(h.strokeIndex !== undefined && { stroke_index: h.strokeIndex }),
  ...(h.yardages !== undefined && { yardages: h.yardages }),
});

export const fromRoundRow = (r: Row): Round => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  dayNo: num(r.day_no),
  name: str(r.name),
  date: str(r.date),
  courseId: str(r.course_id),
  teeId: str(r.tee_id),
  formatLabel: str(r.format_label),
  teeTime: nstr(r.tee_time),
  status: (str(r.status, 'upcoming') as Round['status']) ?? 'upcoming',
  notes: nstr(r.notes),
  sortOrder: num(r.sort_order),
});

export const toRoundRow = (r: Partial<Round>): Row => ({
  ...(r.id !== undefined && { id: r.id }),
  ...(r.tourId !== undefined && { tour_id: r.tourId }),
  ...(r.dayNo !== undefined && { day_no: r.dayNo }),
  ...(r.name !== undefined && { name: r.name }),
  ...(r.date !== undefined && { date: r.date }),
  ...(r.courseId !== undefined && { course_id: r.courseId }),
  ...(r.teeId !== undefined && { tee_id: r.teeId }),
  ...(r.formatLabel !== undefined && { format_label: r.formatLabel }),
  ...(r.teeTime !== undefined && { tee_time: r.teeTime }),
  ...(r.status !== undefined && { status: r.status }),
  ...(r.notes !== undefined && { notes: r.notes }),
  ...(r.sortOrder !== undefined && { sort_order: r.sortOrder }),
});

/**
 * A per-match allowance override, or null.
 *
 * A malformed override would silently change everyone's strokes, so anything
 * that is not a usable weights array falls back to null — meaning "use the
 * tour default for this format" rather than "play off nothing".
 */
export function toAllowanceOverride(value: unknown): HandicapAllowance | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<HandicapAllowance>;
  const weights = Array.isArray(raw.weights)
    ? raw.weights.filter((w): w is number => typeof w === 'number' && Number.isFinite(w))
    : [];
  if (weights.length === 0) return null;
  const rounding = raw.rounding === 'floor' || raw.rounding === 'ceil' ? raw.rounding : 'nearest';
  return { weights, rounding };
}

export const fromMatchRow = (r: Row): Match => ({
  id: str(r.id),
  roundId: str(r.round_id),
  name: str(r.name),
  format: str(r.format, 'singles') as Match['format'],
  startHole: num(r.start_hole, 1),
  endHole: num(r.end_hole, 18),
  pointsValue: num(r.points_value, 1),
  allowanceOverride: toAllowanceOverride(r.allowance_override),
  pairingsConfirmedAt: nstr(r.pairings_confirmed_at),
  pairingsConfirmedBy: nstr(r.pairings_confirmed_by),
  status: (str(r.status, 'upcoming') as Match['status']) ?? 'upcoming',
  sortOrder: num(r.sort_order),
});

export const toMatchRow = (m: Partial<Match>): Row => ({
  ...(m.id !== undefined && { id: m.id }),
  ...(m.roundId !== undefined && { round_id: m.roundId }),
  ...(m.name !== undefined && { name: m.name }),
  ...(m.format !== undefined && { format: m.format }),
  ...(m.startHole !== undefined && { start_hole: m.startHole }),
  ...(m.endHole !== undefined && { end_hole: m.endHole }),
  ...(m.pointsValue !== undefined && { points_value: m.pointsValue }),
  ...(m.allowanceOverride !== undefined && { allowance_override: m.allowanceOverride }),
  ...(m.pairingsConfirmedAt !== undefined && { pairings_confirmed_at: m.pairingsConfirmedAt }),
  ...(m.pairingsConfirmedBy !== undefined && { pairings_confirmed_by: m.pairingsConfirmedBy }),
  ...(m.status !== undefined && { status: m.status }),
  ...(m.sortOrder !== undefined && { sort_order: m.sortOrder }),
});

export const fromSideRow = (r: Row): MatchSide => ({
  id: str(r.id),
  matchId: str(r.match_id),
  teamId: str(r.team_id),
  playerIds: Array.isArray(r.player_ids) ? (r.player_ids as string[]) : [],
  handicapOverride: nnum(r.handicap_override),
  sortOrder: num(r.sort_order),
});

export const toSideRow = (s: Partial<MatchSide>): Row => ({
  ...(s.id !== undefined && { id: s.id }),
  ...(s.matchId !== undefined && { match_id: s.matchId }),
  ...(s.teamId !== undefined && { team_id: s.teamId }),
  ...(s.playerIds !== undefined && { player_ids: s.playerIds }),
  ...(s.handicapOverride !== undefined && { handicap_override: s.handicapOverride }),
  ...(s.sortOrder !== undefined && { sort_order: s.sortOrder }),
});

export const fromScoreRow = (r: Row): Score => ({
  id: str(r.id),
  matchId: str(r.match_id),
  holeNo: num(r.hole_no),
  sideId: str(r.side_id),
  playerId: nstr(r.player_id),
  gross: nnum(r.gross),
  pickedUp: bool(r.picked_up),
  enteredBy: str(r.entered_by, 'unknown'),
  updatedAt: str(r.updated_at, new Date(0).toISOString()),
});

export const fromResultRow = (r: Row): MatchResult => ({
  matchId: str(r.match_id),
  winnerTeamId: nstr(r.winner_team_id),
  pointsHome: num(r.points_home),
  pointsAway: num(r.points_away),
  finalStatus: str(r.final_status),
  decidedOnHole: nnum(r.decided_on_hole),
  createdAt: str(r.created_at),
});

export const toResultRow = (r: Partial<MatchResult>): Row => ({
  ...(r.matchId !== undefined && { match_id: r.matchId }),
  ...(r.winnerTeamId !== undefined && { winner_team_id: r.winnerTeamId }),
  ...(r.pointsHome !== undefined && { points_home: r.pointsHome }),
  ...(r.pointsAway !== undefined && { points_away: r.pointsAway }),
  ...(r.finalStatus !== undefined && { final_status: r.finalStatus }),
  ...(r.decidedOnHole !== undefined && { decided_on_hole: r.decidedOnHole }),
});

export const fromItineraryRow = (r: Row): ItineraryItem => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  date: str(r.date),
  startTime: nstr(r.start_time),
  endTime: nstr(r.end_time),
  title: str(r.title),
  location: nstr(r.location),
  details: nstr(r.details),
  category: (str(r.category, 'social') as ItineraryItem['category']) ?? 'social',
  roundId: nstr(r.round_id),
  sortOrder: num(r.sort_order),
});

export const toItineraryRow = (i: Partial<ItineraryItem>): Row => ({
  ...(i.id !== undefined && { id: i.id }),
  ...(i.tourId !== undefined && { tour_id: i.tourId }),
  ...(i.date !== undefined && { date: i.date }),
  ...(i.startTime !== undefined && { start_time: i.startTime }),
  ...(i.endTime !== undefined && { end_time: i.endTime }),
  ...(i.title !== undefined && { title: i.title }),
  ...(i.location !== undefined && { location: i.location }),
  ...(i.details !== undefined && { details: i.details }),
  ...(i.category !== undefined && { category: i.category }),
  ...(i.roundId !== undefined && { round_id: i.roundId }),
  ...(i.sortOrder !== undefined && { sort_order: i.sortOrder }),
});

export const fromActivityRow = (r: Row): Activity => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  matchId: nstr(r.match_id),
  playerId: nstr(r.player_id),
  type: (str(r.type, 'note') as Activity['type']) ?? 'note',
  message: str(r.message),
  createdAt: str(r.created_at),
});

export const toActivityRow = (a: Partial<Activity>): Row => ({
  ...(a.id !== undefined && { id: a.id }),
  ...(a.tourId !== undefined && { tour_id: a.tourId }),
  ...(a.matchId !== undefined && { match_id: a.matchId }),
  ...(a.playerId !== undefined && { player_id: a.playerId }),
  ...(a.type !== undefined && { type: a.type }),
  ...(a.message !== undefined && { message: a.message }),
});

export const fromFineRow = (r: Row): Fine => ({
  id: str(r.id),
  tourId: str(r.tour_id),
  playerId: str(r.player_id),
  reason: str(r.reason),
  amount: num(r.amount),
  status: (str(r.status, 'open') as Fine['status']) ?? 'open',
  createdAt: str(r.created_at),
});

export const toFineRow = (f: Partial<Fine>): Row => ({
  ...(f.id !== undefined && { id: f.id }),
  ...(f.tourId !== undefined && { tour_id: f.tourId }),
  ...(f.playerId !== undefined && { player_id: f.playerId }),
  ...(f.reason !== undefined && { reason: f.reason }),
  ...(f.amount !== undefined && { amount: f.amount }),
  ...(f.status !== undefined && { status: f.status }),
});

export const fromGroupRow = (r: Row): RoundGroup => ({
  id: str(r.id),
  roundId: str(r.round_id),
  name: str(r.name),
  playerIds: Array.isArray(r.player_ids) ? (r.player_ids as string[]) : [],
  sortOrder: num(r.sort_order),
  updatedBy: str(r.updated_by, 'unknown'),
  updatedAt: str(r.updated_at),
  confirmedAt: nstr(r.confirmed_at),
  confirmedBy: nstr(r.confirmed_by),
});

export const toGroupRow = (g: Partial<RoundGroup>): Row => ({
  ...(g.id !== undefined && { id: g.id }),
  ...(g.roundId !== undefined && { round_id: g.roundId }),
  ...(g.name !== undefined && { name: g.name }),
  ...(g.playerIds !== undefined && { player_ids: g.playerIds }),
  ...(g.sortOrder !== undefined && { sort_order: g.sortOrder }),
  ...(g.updatedBy !== undefined && { updated_by: g.updatedBy }),
  ...(g.updatedAt !== undefined && { updated_at: g.updatedAt }),
  ...(g.confirmedAt !== undefined && { confirmed_at: g.confirmedAt }),
  ...(g.confirmedBy !== undefined && { confirmed_by: g.confirmedBy }),
});

/** Table name -> row mapper, used by the realtime subscription. */
export const ROW_MAPPERS = {
  round_groups: fromGroupRow,
  tours: fromTourRow,
  teams: fromTeamRow,
  players: fromPlayerRow,
  courses: fromCourseRow,
  tees: fromTeeRow,
  holes: fromHoleRow,
  rounds: fromRoundRow,
  matches: fromMatchRow,
  match_sides: fromSideRow,
  scores: fromScoreRow,
  match_results: fromResultRow,
  itinerary_items: fromItineraryRow,
  activity: fromActivityRow,
  fines: fromFineRow,
} as const;

/** Table name -> the TourSnapshot key that holds it. */
export const SNAPSHOT_KEYS = {
  teams: 'teams',
  players: 'players',
  courses: 'courses',
  tees: 'tees',
  holes: 'holes',
  rounds: 'rounds',
  round_groups: 'groups',
  matches: 'matches',
  match_sides: 'sides',
  scores: 'scores',
  match_results: 'results',
  itinerary_items: 'itinerary',
  activity: 'activity',
  fines: 'fines',
} as const;

export type RealtimeTable = keyof typeof SNAPSHOT_KEYS;
