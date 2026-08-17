/**
 * Course scorecard data for the four Belek courses.
 *
 * ⚠️  IMPORTANT — READ THIS ⚠️
 *
 * The build spec lists "Course ratings / slope" and "Hole par + stroke index"
 * as information still to be filled in. Rather than ship an app that cannot
 * calculate a single stroke, every course below is seeded with a COMPLETE and
 * INTERNALLY CONSISTENT scorecard (correct total par, a standard stroke-index
 * spread alternating between the front and back nine, plausible yardages and
 * ratings) so the scoring engine works end to end from the first launch.
 *
 * Every course is flagged `dataVerified: false`. While that flag is false the
 * app shows an amber "Unverified course data" warning on the course card and
 * the scorecard, and Admin -> Courses lets you type in the real numbers from
 * the printed card in about two minutes per course. Tick "Verified" and the
 * warning disappears.
 *
 * DO NOT treat these numbers as the real published scorecards.
 */

export interface SeedTee {
  key: string;
  name: string;
  colour: string;
  courseRating: number;
  slopeRating: number;
  par: number;
  /**
   * Nominal total. The seed builder ignores this and sums the hole yardages
   * instead, so the card and its total can never disagree.
   */
  yardage: number;
}

export interface SeedHole {
  holeNo: number;
  par: number;
  strokeIndex: number;
  /** Yardage keyed by tee key. */
  yardages: Record<string, number>;
}

export interface SeedCourse {
  key: string;
  name: string;
  location: string;
  sourceUrl: string | null;
  notes: string;
  dataVerified: boolean;
  tees: SeedTee[];
  defaultTeeKey: string;
  holes: SeedHole[];
}

/**
 * Build an 18-hole card from a compact definition.
 * `pars` is 18 numbers; `strokeIndexes` is 18 numbers; `yardages` maps a tee
 * key to 18 numbers.
 */
function buildHoles(
  pars: number[],
  strokeIndexes: number[],
  yardages: Record<string, number[]>,
): SeedHole[] {
  return pars.map((par, i) => ({
    holeNo: i + 1,
    par,
    strokeIndex: strokeIndexes[i],
    yardages: Object.fromEntries(
      Object.entries(yardages).map(([teeKey, list]) => [teeKey, list[i]]),
    ),
  }));
}

// ---------------------------------------------------------------------------
// Day 1 — Faldo Course (Cornelia Golf Club, Belek). Par 71.
// ---------------------------------------------------------------------------

const FALDO: SeedCourse = {
  key: 'faldo',
  name: 'Faldo Course',
  location: 'Cornelia Golf Club, Belek, Turkey',
  sourceUrl: null,
  notes: 'Day 1 — 4-man Team Scramble. Tee times 11:00.',
  dataVerified: false,
  defaultTeeKey: 'yellow',
  tees: [
    { key: 'white', name: 'White', colour: '#e8e8e8', courseRating: 72.4, slopeRating: 137, par: 71, yardage: 6825 },
    { key: 'yellow', name: 'Yellow', colour: '#f2c53d', courseRating: 70.8, slopeRating: 131, par: 71, yardage: 6338 },
    { key: 'red', name: 'Red', colour: '#d9414a', courseRating: 68.2, slopeRating: 124, par: 71, yardage: 5570 },
  ],
  holes: buildHoles(
    [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 4, 4],
    [7, 5, 15, 11, 1, 9, 17, 13, 3, 8, 16, 4, 12, 2, 10, 18, 6, 14],
    {
      white: [401, 428, 178, 534, 452, 410, 165, 512, 421, 396, 190, 447, 528, 460, 385, 158, 416, 344],
      yellow: [372, 398, 162, 498, 418, 381, 150, 478, 392, 366, 172, 414, 492, 428, 356, 143, 386, 332],
      red: [325, 348, 138, 432, 366, 334, 128, 418, 342, 320, 148, 362, 430, 374, 312, 122, 338, 293],
    },
  ),
};

// ---------------------------------------------------------------------------
// Day 2 — Carya Golf Course (Belek). Par 72.
// ---------------------------------------------------------------------------

const CARYA: SeedCourse = {
  key: 'carya',
  name: 'Carya Golf Course',
  location: 'Carya Golf Club, Belek, Turkey',
  sourceUrl: null,
  notes: 'Day 2 — Better Ball Match Play. Twilight tee time 18:27, floodlit finish.',
  dataVerified: false,
  defaultTeeKey: 'yellow',
  tees: [
    { key: 'white', name: 'White', colour: '#e8e8e8', courseRating: 73.1, slopeRating: 139, par: 72, yardage: 6981 },
    { key: 'yellow', name: 'Yellow', colour: '#f2c53d', courseRating: 71.3, slopeRating: 132, par: 72, yardage: 6465 },
    { key: 'red', name: 'Red', colour: '#d9414a', courseRating: 69.0, slopeRating: 125, par: 72, yardage: 5642 },
  ],
  holes: buildHoles(
    [4, 5, 4, 3, 4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5],
    [9, 13, 3, 17, 1, 7, 11, 15, 5, 6, 2, 18, 14, 4, 10, 16, 8, 12],
    {
      white: [412, 545, 448, 186, 462, 405, 528, 172, 425, 398, 455, 165, 540, 447, 388, 178, 420, 507],
      yellow: [382, 508, 415, 168, 428, 376, 492, 158, 396, 368, 421, 152, 502, 414, 359, 162, 389, 475],
      red: [332, 442, 362, 142, 372, 328, 430, 134, 345, 320, 366, 130, 438, 360, 312, 138, 338, 413],
    },
  ),
};

// ---------------------------------------------------------------------------
// Day 3 — PGA Sultan (Antalya Golf Club). Par 71.
// One 18-hole card, split by the match engine into H1-6, H7-12 and H13-18.
// ---------------------------------------------------------------------------

const SULTAN: SeedCourse = {
  key: 'pga-sultan',
  name: 'PGA Sultan',
  location: 'Antalya Golf Club, Belek, Turkey',
  sourceUrl: null,
  notes:
    'Day 3 — one course, three six-hole matches: H1-6 Singles, H7-12 Two-man Scramble, H13-18 Alternate Shot.',
  dataVerified: false,
  defaultTeeKey: 'yellow',
  tees: [
    { key: 'white', name: 'White', colour: '#e8e8e8', courseRating: 73.6, slopeRating: 141, par: 71, yardage: 7075 },
    { key: 'yellow', name: 'Yellow', colour: '#f2c53d', courseRating: 71.6, slopeRating: 133, par: 71, yardage: 6522 },
    { key: 'red', name: 'Red', colour: '#d9414a', courseRating: 69.4, slopeRating: 126, par: 71, yardage: 5710 },
  ],
  holes: buildHoles(
    [4, 4, 5, 3, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 4],
    [5, 11, 15, 17, 1, 9, 7, 13, 3, 2, 10, 16, 8, 12, 6, 18, 4, 14],
    {
      white: [432, 405, 552, 192, 471, 418, 428, 176, 538, 462, 411, 168, 440, 545, 452, 182, 468, 335],
      yellow: [398, 374, 512, 174, 436, 386, 396, 160, 498, 428, 380, 154, 406, 505, 418, 166, 432, 399],
      red: [346, 326, 448, 148, 380, 336, 344, 138, 434, 372, 331, 132, 354, 440, 364, 142, 376, 299],
    },
  ),
};

// ---------------------------------------------------------------------------
// Day 4 — Montgomerie Maxx Royal (Belek). Par 72.
// ---------------------------------------------------------------------------

const MONTGOMERIE: SeedCourse = {
  key: 'montgomerie',
  name: 'Montgomerie Maxx Royal',
  location: 'Montgomerie Maxx Royal, Belek, Turkey',
  sourceUrl: null,
  notes: 'Day 4 — Singles Match Play. Four concurrent matches. Trophy presented after the round.',
  dataVerified: false,
  defaultTeeKey: 'yellow',
  tees: [
    { key: 'white', name: 'White', colour: '#e8e8e8', courseRating: 73.0, slopeRating: 138, par: 72, yardage: 6944 },
    { key: 'yellow', name: 'Yellow', colour: '#f2c53d', courseRating: 71.1, slopeRating: 130, par: 72, yardage: 6412 },
    { key: 'red', name: 'Red', colour: '#d9414a', courseRating: 68.8, slopeRating: 123, par: 72, yardage: 5588 },
  ],
  holes: buildHoles(
    [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 3, 4, 4, 5],
    [7, 17, 13, 3, 9, 15, 1, 11, 5, 4, 8, 18, 14, 2, 16, 10, 6, 12],
    {
      white: [408, 182, 536, 445, 396, 168, 462, 522, 421, 432, 402, 158, 548, 458, 176, 388, 425, 517],
      yellow: [376, 165, 496, 412, 366, 152, 428, 484, 389, 398, 372, 145, 506, 424, 162, 358, 393, 486],
      red: [328, 140, 432, 358, 320, 130, 372, 422, 338, 346, 324, 124, 440, 368, 138, 312, 342, 434],
    },
  ),
};

export const SEED_COURSES: SeedCourse[] = [FALDO, CARYA, SULTAN, MONTGOMERIE];
