/**
 * The Pars & Pirates Tour 2026 seed data.
 *
 * This is the single source of truth for the seeded tour. It is consumed by:
 *   1. `scripts/generate-seed-sql.ts` -> `supabase/seed.sql` (the real database)
 *   2. `src/lib/data/local-store.ts`  (demo mode, no database required)
 *
 * Keeping one source means the demo you look at and the database you deploy
 * can never drift apart.
 *
 * Everything here is editable in the app's Admin screens once it is running —
 * pairings, handicaps, tee times, itinerary, course data and the points rules.
 */

import { SEED_COURSES } from './courses';
import { stableId } from './ids';
import {
  DEFAULT_TOUR_SETTINGS,
  type Course,
  type Hole,
  type ItineraryItem,
  type Match,
  type MatchSide,
  type Player,
  type Round,
  type RoundGroup,
  type Team,
  type Tee,
  type Tour,
  type TourSnapshot,
} from '@/lib/types';

export const TOUR_ID = stableId('tour:pars-and-pirates-2026');

const TEAM_KEYS = { pars: 'team:pars', pirates: 'team:pirates' } as const;
export const TEAM_IDS = {
  pars: stableId(TEAM_KEYS.pars),
  pirates: stableId(TEAM_KEYS.pirates),
};

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

interface SeedPlayer {
  key: string;
  name: string;
  nickname: string | null;
  team: 'pars' | 'pirates';
  isCaptain: boolean;
  /**
   * Runs the tour and owns the app. A label, not a permission — admin access
   * comes from the ADMIN_PIN, so the organiser need not be a captain.
   */
  isOrganiser?: boolean;
  /**
   * Current HNA Handicap Index, supplied by the organiser and entered by hand.
   * This is an INDEX, not a course handicap — the engine converts it per course
   * and tee via the WHS formula, then applies the format allowance.
   */
  handicapIndex: number;
}

const SEED_PLAYERS: SeedPlayer[] = [
  { key: 'jason-dunbar', name: 'Jason Dunbar', nickname: 'Skipper', team: 'pars', isCaptain: true, handicapIndex: 11.3 },
  { key: 'alan-hector', name: 'Alan Hector', nickname: null, team: 'pars', isCaptain: false, handicapIndex: 22.0 },
  { key: 'andrew-rushmere', name: 'Andrew Rushmere', nickname: null, team: 'pars', isCaptain: false, handicapIndex: 4.0 },
  { key: 'ryan-dahl', name: 'Ryan Dahl', nickname: null, team: 'pars', isCaptain: false, handicapIndex: 8.8 },
  { key: 'jordy-west', name: 'Jordy West', nickname: 'Cap’n', team: 'pirates', isCaptain: true, handicapIndex: 9.6 },
  { key: 'connor-grealy', name: 'Connor Grealy', nickname: null, team: 'pirates', isCaptain: false, isOrganiser: true, handicapIndex: 9.3 },
  { key: 'nick-georgoulakis', name: 'Nick Georgoulakis', nickname: null, team: 'pirates', isCaptain: false, handicapIndex: 15.9 },
  { key: 'dan-kramer', name: 'Dan Kramer', nickname: null, team: 'pirates', isCaptain: false, handicapIndex: 15.0 },
];

/**
 * Timestamp stamped on the seeded handicap indexes. Fixed rather than "now" so
 * re-running the seed generator produces byte-identical SQL.
 */
const HANDICAPS_SUPPLIED_AT = '2026-08-17T00:00:00.000Z';

export const PLAYER_IDS: Record<string, string> = Object.fromEntries(
  SEED_PLAYERS.map((p) => [p.key, stableId(`player:${p.key}`)]),
);

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Rounds & matches
// ---------------------------------------------------------------------------

interface SeedMatch {
  key: string;
  name: string;
  format: Match['format'];
  startHole: number;
  endHole: number;
  /**
   * Points at stake in this match. A halved match splits it, so the tour's
   * 11 points break down as: Day 1 = 2, Day 2 = 2, Day 3 = 3, Day 4 = 4.
   */
  points: number;
  /** Player keys per side; index 0 is The Pars, index 1 is Pin High Pirates. */
  sides: [string[], string[]];
}

interface SeedRound {
  key: string;
  dayNo: number;
  name: string;
  date: string;
  courseKey: string;
  formatLabel: string;
  teeTime: string;
  notes: string;
  matches: SeedMatch[];
}

/**
 * Default 4-balls — who physically plays together.
 *
 * Every round starts with the same two groups; they are expected to change
 * from day to day and any player can rearrange them in the app. This is NOT
 * the competitive structure: on a singles day one of these groups contains two
 * separate matches, and on Day 3 the group stays together for all 18 holes
 * while the format changes three times underneath it.
 */
const DEFAULT_FOUR_BALLS: string[][] = [
  ['jason-dunbar', 'alan-hector', 'jordy-west', 'connor-grealy'],
  ['andrew-rushmere', 'ryan-dahl', 'nick-georgoulakis', 'dan-kramer'],
];

/**
 * Default pairings.
 *
 * The spec lists Day 2 pairings, Day 3 matchups and the Day 4 singles order as
 * still to be decided by the captains. These are balanced defaults so the app
 * is fully playable today; Admin -> Pairings changes any of them in a few taps.
 */
const SEED_ROUNDS: SeedRound[] = [
  {
    key: 'day-1',
    dayNo: 1,
    name: 'Day 1 — Scramble',
    date: '2026-08-29',
    courseKey: 'faldo',
    formatLabel: '2-Man Scramble',
    teeTime: '11:00',
    notes:
      'Breakfast 08:00–09:30. Springboks v New Zealand at 17:00 — Springbok jerseys are a must. Day 2 teams announced after the rugby.',
    // Two 4-balls, each one a 2-man scramble match worth a point, so the day
    // is still worth 2. The pairings follow the default 4-balls.
    matches: [
      {
        key: 'd1-m1',
        name: 'Scramble 1',
        format: 'two_man_scramble',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [
          ['jason-dunbar', 'alan-hector'],
          ['jordy-west', 'connor-grealy'],
        ],
      },
      {
        key: 'd1-m2',
        name: 'Scramble 2',
        format: 'two_man_scramble',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [
          ['andrew-rushmere', 'ryan-dahl'],
          ['nick-georgoulakis', 'dan-kramer'],
        ],
      },
    ],
  },
  {
    key: 'day-2',
    dayNo: 2,
    name: 'Day 2 — Better Ball',
    date: '2026-08-30',
    courseKey: 'carya',
    formatLabel: 'Better Ball Match Play',
    teeTime: '18:27',
    notes: 'Sleep in. Free day. First fines meeting after the round. Out to town — LARGE.',
    matches: [
      {
        key: 'd2-m1',
        name: 'Match 1',
        format: 'better_ball',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [
          ['jason-dunbar', 'alan-hector'],
          ['jordy-west', 'connor-grealy'],
        ],
      },
      {
        key: 'd2-m2',
        name: 'Match 2',
        format: 'better_ball',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [
          ['andrew-rushmere', 'ryan-dahl'],
          ['nick-georgoulakis', 'dan-kramer'],
        ],
      },
    ],
  },
  {
    key: 'day-3',
    dayNo: 3,
    name: 'Day 3 — Triple Threat',
    date: '2026-09-01',
    courseKey: 'pga-sultan',
    // Matches what `describeRoundFormat` derives from the matches below, so a
    // freshly seeded tour does not immediately offer to relabel itself.
    formatLabel: 'H1–6 Scramble · H7–12 Shamble · H13–18 Better Ball',
    teeTime: '12:00',
    notes:
      'Breakfast 09:00–11:00. 19:00 captains announce the Day 4 singles line-up. Free evening.',
    // Three six-hole formats off one card, two matches in each. The pairings
    // below follow the default 4-balls, but every section can be re-paired
    // independently on the round screen without moving anybody's 4-ball.
    matches: [
      // Holes 1-6: two-man scramble.
      {
        key: 'd3-sc1',
        name: 'Scramble 1',
        format: 'two_man_scramble',
        startHole: 1,
        endHole: 6,
        points: 0.5,
        sides: [
          ['jason-dunbar', 'alan-hector'],
          ['jordy-west', 'connor-grealy'],
        ],
      },
      {
        key: 'd3-sc2',
        name: 'Scramble 2',
        format: 'two_man_scramble',
        startHole: 1,
        endHole: 6,
        points: 0.5,
        sides: [
          ['andrew-rushmere', 'ryan-dahl'],
          ['nick-georgoulakis', 'dan-kramer'],
        ],
      },
      // Holes 7-12: shamble — best drive, then own ball in, lower net counts.
      {
        key: 'd3-sh1',
        name: 'Shamble 1',
        format: 'shamble',
        startHole: 7,
        endHole: 12,
        points: 0.5,
        sides: [
          ['jason-dunbar', 'alan-hector'],
          ['jordy-west', 'connor-grealy'],
        ],
      },
      {
        key: 'd3-sh2',
        name: 'Shamble 2',
        format: 'shamble',
        startHole: 7,
        endHole: 12,
        points: 0.5,
        sides: [
          ['andrew-rushmere', 'ryan-dahl'],
          ['nick-georgoulakis', 'dan-kramer'],
        ],
      },
      // Holes 13-18: two-man better ball.
      {
        key: 'd3-bb1',
        name: 'Better Ball 1',
        format: 'better_ball',
        startHole: 13,
        endHole: 18,
        points: 0.5,
        sides: [
          ['jason-dunbar', 'alan-hector'],
          ['jordy-west', 'connor-grealy'],
        ],
      },
      {
        key: 'd3-bb2',
        name: 'Better Ball 2',
        format: 'better_ball',
        startHole: 13,
        endHole: 18,
        points: 0.5,
        sides: [
          ['andrew-rushmere', 'ryan-dahl'],
          ['nick-georgoulakis', 'dan-kramer'],
        ],
      },
    ],
  },
  {
    key: 'day-4',
    dayNo: 4,
    name: 'Day 4 — Singles',
    date: '2026-09-02',
    courseKey: 'montgomerie',
    formatLabel: 'Singles Match Play',
    teeTime: '10:30',
    notes:
      'Breakfast 07:00–09:00. Trophy presentation, closing ceremony and final fines after the round. Out in town.',
    matches: [
      {
        key: 'd4-m1',
        name: 'Match 1',
        format: 'singles',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [['jason-dunbar'], ['jordy-west']],
      },
      {
        key: 'd4-m2',
        name: 'Match 2',
        format: 'singles',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [['alan-hector'], ['connor-grealy']],
      },
      {
        key: 'd4-m3',
        name: 'Match 3',
        format: 'singles',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [['andrew-rushmere'], ['nick-georgoulakis']],
      },
      {
        key: 'd4-m4',
        name: 'Match 4',
        format: 'singles',
        startHole: 1,
        endHole: 18,
        points: 1,
        sides: [['ryan-dahl'], ['dan-kramer']],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Itinerary — exactly as supplied in the build spec
// ---------------------------------------------------------------------------

interface SeedItineraryItem {
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  location: string | null;
  details: string | null;
  category: ItineraryItem['category'];
  roundKey?: string;
}

const SEED_ITINERARY: SeedItineraryItem[] = [
  // 28 Aug 2026 — Arrival
  { date: '2026-08-28', startTime: '08:15', endTime: null, title: 'Flight from Gatwick', location: 'London Gatwick (LGW)', details: 'Be at the airport in good time. Boarding passes on phones.', category: 'travel' },
  { date: '2026-08-28', startTime: '14:35', endTime: null, title: 'Land in Turkey — transfer to hotel', location: 'Antalya (AYT)', details: 'Land 14:35, then transfer to the hotel. Check-in opens 14:00.', category: 'travel' },
  { date: '2026-08-28', startTime: '15:30', endTime: null, title: 'Drop bags and lunch', location: 'Hotel', details: 'Drop stuff in rooms, then lunch.', category: 'meal' },
  { date: '2026-08-28', startTime: '17:00', endTime: null, title: 'Driving range / practice', location: 'Practice facility', details: 'Loosen up after the flight. Shake off the travel.', category: 'golf' },
  { date: '2026-08-28', startTime: '20:00', endTime: null, title: 'Opening ceremony & first dinner', location: 'Hotel', details: 'At the hotel due to late arrivals. Team reveal, captains’ speeches. Staying at the hotel tonight.', category: 'ceremony' },

  // 29 Aug 2026 — Golf Day 1
  { date: '2026-08-29', startTime: '08:00', endTime: '09:30', title: 'Breakfast', location: 'Hotel', details: null, category: 'meal' },
  { date: '2026-08-29', startTime: '11:00', endTime: null, title: 'GOLF DAY 1 — Faldo Course', location: 'Cornelia Golf Club, Belek', details: '2-Man Scramble — two matches. Tee off 11:00.', category: 'golf', roundKey: 'day-1' },
  { date: '2026-08-29', startTime: '17:00', endTime: null, title: 'Springboks v New Zealand', location: 'Hotel bar', details: 'Springbok jerseys are a must. Non-negotiable.', category: 'sport' },
  { date: '2026-08-29', startTime: '19:30', endTime: null, title: 'Day 2 teams announced', location: 'Hotel', details: 'Captains announce the Better Ball pairings after the rugby.', category: 'ceremony' },

  // 30 Aug 2026 — Golf Day 2
  { date: '2026-08-30', startTime: null, endTime: null, title: 'Sleep in — free morning', location: null, details: 'No alarms. Free day until the late tee time.', category: 'rest' },
  { date: '2026-08-30', startTime: '18:27', endTime: null, title: 'GOLF DAY 2 — Carya Golf Course', location: 'Carya Golf Club, Belek', details: 'Better Ball Match Play. Tee off 18:27.', category: 'golf', roundKey: 'day-2' },
  { date: '2026-08-30', startTime: '22:00', endTime: null, title: 'First fines meeting', location: 'Clubhouse', details: 'Bring your evidence. No mercy.', category: 'social' },
  { date: '2026-08-30', startTime: '23:00', endTime: null, title: 'Out to town — LARGE', location: 'Belek', details: 'Self-explanatory.', category: 'social' },

  // 31 Aug 2026 — Rest / Reveal
  { date: '2026-08-31', startTime: null, endTime: null, title: 'Rest / free day', location: null, details: 'Recovery. Pool, beach, spa, whatever is required.', category: 'rest' },
  { date: '2026-08-31', startTime: '16:00', endTime: '18:00', title: 'Padel', location: 'Padel courts', details: 'Two hours booked.', category: 'sport' },
  { date: '2026-08-31', startTime: '19:00', endTime: null, title: 'Captain tee announcement', location: 'Hotel', details: 'Captains reveal the Day 3 line-ups.', category: 'ceremony' },
  { date: '2026-08-31', startTime: '20:30', endTime: null, title: 'Nice late lunch / dinner', location: 'TBC', details: 'Somewhere decent.', category: 'meal' },

  // 1 Sep 2026 — Golf Day 3
  { date: '2026-09-01', startTime: '09:00', endTime: '11:00', title: 'Breakfast', location: 'Hotel', details: null, category: 'meal' },
  { date: '2026-09-01', startTime: '12:00', endTime: null, title: 'GOLF DAY 3 — PGA Sultan', location: 'Antalya Golf Club, Belek', details: 'H1–6 Two-man Scramble • H7–12 Shamble • H13–18 Better Ball. Tee off 12:00.', category: 'golf', roundKey: 'day-3' },
  { date: '2026-09-01', startTime: '19:00', endTime: null, title: 'Captains announce Day 4 singles', location: 'Hotel', details: 'The big one. Singles order revealed.', category: 'ceremony' },
  { date: '2026-09-01', startTime: '20:00', endTime: null, title: 'Free evening', location: null, details: 'Rest up before the final day.', category: 'rest' },

  // 2 Sep 2026 — Golf Day 4
  { date: '2026-09-02', startTime: '07:00', endTime: '09:00', title: 'Breakfast', location: 'Hotel', details: null, category: 'meal' },
  { date: '2026-09-02', startTime: '10:30', endTime: null, title: 'GOLF DAY 4 — Montgomerie', location: 'Montgomerie Maxx Royal, Belek', details: 'Singles Match Play. Four matches. Tee off 10:30.', category: 'golf', roundKey: 'day-4' },
  { date: '2026-09-02', startTime: '17:00', endTime: null, title: 'Trophy presentation', location: 'Clubhouse', details: 'Awarding of the trophy.', category: 'ceremony' },
  { date: '2026-09-02', startTime: '19:00', endTime: null, title: 'Closing ceremony & final fines', location: 'Hotel', details: 'Last chance to settle up.', category: 'ceremony' },
  { date: '2026-09-02', startTime: '21:30', endTime: null, title: 'Out in town', location: 'Belek', details: 'Winners buy. Losers buy more.', category: 'social' },

  // 3 Sep 2026 — Recovery
  { date: '2026-09-03', startTime: null, endTime: null, title: 'Free day / detox', location: null, details: 'Damage assessment.', category: 'rest' },
  { date: '2026-09-03', startTime: '15:00', endTime: null, title: 'Beach late lunch or dinner', location: 'Beach', details: 'Whole group.', category: 'meal' },
  { date: '2026-09-03', startTime: '20:00', endTime: null, title: 'Free evening', location: null, details: null, category: 'rest' },

  // 4 Sep 2026 — Departure
  { date: '2026-09-04', startTime: '10:00', endTime: null, title: 'Check out', location: 'Hotel', details: 'Bags down by 10:00.', category: 'travel' },
  { date: '2026-09-04', startTime: '11:00', endTime: null, title: 'Beach day or head to Antalya', location: 'Belek / Antalya', details: 'Kill time until the flight.', category: 'travel' },
];

// ---------------------------------------------------------------------------
// Build the snapshot
// ---------------------------------------------------------------------------

export function buildSeedSnapshot(): TourSnapshot {
  const tour: Tour = {
    id: TOUR_ID,
    name: 'Pars & Pirates Tour',
    year: 2026,
    startDate: '2026-08-28',
    endDate: '2026-09-04',
    location: 'Belek, Turkey',
    status: 'upcoming',
    winningTeamId: null,
    trophyName: 'The Pars & Pirates Trophy',
    settings: DEFAULT_TOUR_SETTINGS,
  };

  const teams: Team[] = [
    {
      id: TEAM_IDS.pars,
      tourId: TOUR_ID,
      name: 'The Pars',
      shortName: 'PARS',
      colour: '#0f7a4d',
      accent: '#3ddc84',
      crest: '⛳',
      captainPlayerId: PLAYER_IDS['jason-dunbar'],
      sortOrder: 0,
    },
    {
      id: TEAM_IDS.pirates,
      tourId: TOUR_ID,
      name: 'Pin High Pirates',
      shortName: 'PIRATES',
      colour: '#8b1f2f',
      accent: '#e8574a',
      crest: '🏴‍☠️',
      captainPlayerId: PLAYER_IDS['jordy-west'],
      sortOrder: 1,
    },
  ];

  const players: Player[] = SEED_PLAYERS.map((p, i) => ({
    id: PLAYER_IDS[p.key],
    tourId: TOUR_ID,
    teamId: TEAM_IDS[p.team],
    name: p.name,
    nickname: p.nickname,
    initials: initialsOf(p.name),
    isCaptain: p.isCaptain,
    isOrganiser: p.isOrganiser ?? false,
    // HNA membership numbers are still to be supplied; the handicap indexes
    // below are the current HNA figures, entered by hand (Admin -> Players
    // edits them, and records who changed them and when).
    hnaId: null,
    handicapIndex: p.handicapIndex,
    handicapSource: 'manual',
    handicapUpdatedAt: HANDICAPS_SUPPLIED_AT,
    photoUrl: null,
    sortOrder: i,
  }));

  const courses: Course[] = [];
  const tees: Tee[] = [];
  const holes: Hole[] = [];
  const teeIdByCourseTee: Record<string, string> = {};
  const courseIdByKey: Record<string, string> = {};

  for (const seedCourse of SEED_COURSES) {
    const courseId = stableId(`course:${seedCourse.key}`);
    courseIdByKey[seedCourse.key] = courseId;
    courses.push({
      id: courseId,
      tourId: TOUR_ID,
      name: seedCourse.name,
      location: seedCourse.location,
      sourceUrl: seedCourse.sourceUrl,
      notes: seedCourse.notes,
      routing: seedCourse.routing ?? null,
      nineNames: seedCourse.nineNames ?? null,
      dataVerified: seedCourse.dataVerified,
      verifiedAt: null,
      verifiedBy: null,
      sourceNotes: null,
      scorecardImageId: null,
    });

    for (const seedTee of seedCourse.tees) {
      const teeId = stableId(`tee:${seedCourse.key}:${seedTee.key}`);
      teeIdByCourseTee[`${seedCourse.key}:${seedTee.key}`] = teeId;
      tees.push({
        id: teeId,
        courseId,
        name: seedTee.name,
        colour: seedTee.colour,
        courseRating: seedTee.courseRating,
        slopeRating: seedTee.slopeRating,
        par: seedTee.par,
        // Derived from the holes rather than taken from the tee definition, so
        // the total on the course card can never contradict the card itself.
        yardage: seedCourse.holes.reduce((sum, h) => sum + (h.yardages[seedTee.key] ?? 0), 0),
        distanceUnit: 'yards',
      });
    }

    for (const seedHole of seedCourse.holes) {
      holes.push({
        id: stableId(`hole:${seedCourse.key}:${seedHole.holeNo}`),
        courseId,
        holeNo: seedHole.holeNo,
        par: seedHole.par,
        strokeIndex: seedHole.strokeIndex,
        yardages: Object.fromEntries(
          Object.entries(seedHole.yardages).map(([teeKey, yards]) => [
            teeIdByCourseTee[`${seedCourse.key}:${teeKey}`],
            yards,
          ]),
        ),
      });
    }
  }

  const rounds: Round[] = [];
  const groups: RoundGroup[] = [];
  const matches: Match[] = [];
  const sides: MatchSide[] = [];
  const roundIdByKey: Record<string, string> = {};

  SEED_ROUNDS.forEach((seedRound, roundIndex) => {
    const roundId = stableId(`round:${seedRound.key}`);
    roundIdByKey[seedRound.key] = roundId;
    const seedCourse = SEED_COURSES.find((c) => c.key === seedRound.courseKey);
    if (!seedCourse) throw new Error(`Unknown course key: ${seedRound.courseKey}`);

    rounds.push({
      id: roundId,
      tourId: TOUR_ID,
      dayNo: seedRound.dayNo,
      name: seedRound.name,
      date: seedRound.date,
      courseId: courseIdByKey[seedRound.courseKey],
      teeId: teeIdByCourseTee[`${seedRound.courseKey}:${seedCourse.defaultTeeKey}`],
      formatLabel: seedRound.formatLabel,
      teeTime: seedRound.teeTime,
      status: 'upcoming',
      notes: seedRound.notes,
      sortOrder: roundIndex,
    });

    // Default 4-balls: who physically walks together. Two groups of four,
    // each two Pars and two Pirates. Every player can rearrange these in the
    // app without admin rights, and they are expected to change day to day —
    // which is exactly why they are stored apart from the matches below.
    DEFAULT_FOUR_BALLS.forEach((playerKeys, groupIndex) => {
      groups.push({
        id: stableId(`group:${seedRound.key}:${groupIndex}`),
        roundId,
        name: `4-Ball ${groupIndex + 1}`,
        playerIds: playerKeys.map((key) => PLAYER_IDS[key]),
        sortOrder: groupIndex,
        updatedBy: 'Seeded default',
        updatedAt: HANDICAPS_SUPPLIED_AT,
        // Seeded groups are a starting point, not a decision — somebody still
        // confirms them on the day.
        confirmedAt: null,
        confirmedBy: null,
      });
    });

    seedRound.matches.forEach((seedMatch, matchIndex) => {
      const matchId = stableId(`match:${seedMatch.key}`);
      matches.push({
        id: matchId,
        roundId,
        name: seedMatch.name,
        format: seedMatch.format,
        startHole: seedMatch.startHole,
        endHole: seedMatch.endHole,
        pointsValue: seedMatch.points,
        // Seeded matches use the tour default allowance for their format.
        // Admin -> Pairings can give any one of them its own.
        allowanceOverride: null,
        pairingsConfirmedAt: null,
        pairingsConfirmedBy: null,
        status: 'upcoming',
        sortOrder: matchIndex,
      });

      const teamOrder: Array<'pars' | 'pirates'> = ['pars', 'pirates'];
      seedMatch.sides.forEach((playerKeys, sideIndex) => {
        sides.push({
          id: stableId(`side:${seedMatch.key}:${sideIndex}`),
          matchId,
          teamId: TEAM_IDS[teamOrder[sideIndex]],
          playerIds: playerKeys.map((key) => PLAYER_IDS[key]),
          handicapOverride: null,
          sortOrder: sideIndex,
        });
      });
    });
  });

  const itinerary: ItineraryItem[] = SEED_ITINERARY.map((item, i) => ({
    id: stableId(`itinerary:${item.date}:${item.title}`),
    tourId: TOUR_ID,
    date: item.date,
    startTime: item.startTime,
    endTime: item.endTime,
    title: item.title,
    location: item.location,
    details: item.details,
    category: item.category,
    roundId: item.roundKey ? roundIdByKey[item.roundKey] : null,
    sortOrder: i,
  }));

  return {
    tour,
    teams,
    players,
    courses,
    tees,
    holes,
    rounds,
    groups,
    matches,
    sides,
    scores: [],
    results: [],
    itinerary,
    activity: [],
    fines: [],
  };
}
