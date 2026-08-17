/**
 * Scorecard photo extraction — shared types and the JSON schema the model is
 * constrained to.
 *
 * The workflow this serves, deliberately, never trusts the extraction:
 *
 *   upload photo -> extract -> REVIEW SCREEN -> human corrects -> verify
 *
 * Nothing extracted is ever written to the course record automatically, and
 * `dataVerified` is only ever set by an explicit human action. Every field
 * carries a confidence so the review screen can highlight what to check, and
 * anything the model could not read comes back null rather than invented.
 */

import type { DistanceUnit } from '@/lib/types';

export type Confidence = 'high' | 'low' | 'unreadable';

export interface ExtractedHole {
  holeNo: number;
  par: number | null;
  strokeIndex: number | null;
  distance: number | null;
  confidence: Confidence;
}

/** What the model returns. `distanceUnit` is widened to carry "unknown". */
export interface RawExtractedScorecard extends Omit<ExtractedScorecard, 'distanceUnit'> {
  distanceUnit: DistanceUnit | 'unknown' | null;
}

export interface ExtractedScorecard {
  courseName: string | null;
  teeName: string | null;
  teeColour: string | null;
  distanceUnit: DistanceUnit | null;
  par: number | null;
  courseRating: number | null;
  slopeRating: number | null;
  holes: ExtractedHole[];
  /** Per-field confidence for the header values. */
  confidence: {
    courseName: Confidence;
    teeName: Confidence;
    distanceUnit: Confidence;
    par: Confidence;
    courseRating: Confidence;
    slopeRating: Confidence;
  };
  /** Anything the model wants the human to know — ambiguity, glare, crops. */
  notes: string | null;
}

/**
 * The response schema. Structured outputs guarantee the shape, which means the
 * review screen never has to defend against a malformed reply.
 *
 * Note the constraints structured outputs does NOT support (minimum, maximum,
 * minLength) — ranges are enforced in `sanitiseExtraction` below instead.
 */
export const SCORECARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['courseName', 'teeName', 'teeColour', 'distanceUnit', 'par', 'courseRating', 'slopeRating', 'holes', 'confidence', 'notes'],
  properties: {
    courseName: { type: ['string', 'null'], description: 'Course name exactly as printed. Null if not visible.' },
    teeName: { type: ['string', 'null'], description: 'Tee name or colour this column of distances belongs to, e.g. "Yellow", "White", "Blue". Null if not visible.' },
    teeColour: { type: ['string', 'null'], description: 'Hex colour for the tee if its colour is identifiable, e.g. "#f2c53d". Null otherwise.' },
    distanceUnit: {
      type: 'string',
      enum: ['yards', 'metres', 'unknown'],
      description: 'Unit the hole distances are printed in. Look for "yards"/"yds" or "metres"/"m" on the card. Use "unknown" if genuinely ambiguous — do NOT guess.',
    },
    par: { type: ['integer', 'null'], description: 'Total par for 18 holes as printed. Null if not visible.' },
    courseRating: { type: ['number', 'null'], description: 'Course Rating for this tee, e.g. 71.6. Null if not printed on the card — do NOT estimate or calculate it.' },
    slopeRating: { type: ['integer', 'null'], description: 'Slope Rating for this tee, e.g. 133. Null if not printed on the card — do NOT estimate or calculate it.' },
    holes: {
      type: 'array',
      description: 'One entry per hole, holes 1 to 18 in order.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['holeNo', 'par', 'strokeIndex', 'distance', 'confidence'],
        properties: {
          holeNo: { type: 'integer', description: 'Hole number, 1 to 18.' },
          par: { type: ['integer', 'null'], description: 'Par for this hole, usually 3 to 5.' },
          strokeIndex: { type: ['integer', 'null'], description: 'Stroke index (also printed as SI, HCP, HDCP or "Index"), 1 to 18. This is NOT the hole number.' },
          distance: { type: ['integer', 'null'], description: 'Distance for the selected tee, in the unit reported above.' },
          confidence: { type: 'string', enum: ['high', 'low', 'unreadable'], description: 'How clearly this row could be read.' },
        },
      },
    },
    confidence: {
      type: 'object',
      additionalProperties: false,
      required: ['courseName', 'teeName', 'distanceUnit', 'par', 'courseRating', 'slopeRating'],
      properties: {
        courseName: { type: 'string', enum: ['high', 'low', 'unreadable'] },
        teeName: { type: 'string', enum: ['high', 'low', 'unreadable'] },
        distanceUnit: { type: 'string', enum: ['high', 'low', 'unreadable'] },
        par: { type: 'string', enum: ['high', 'low', 'unreadable'] },
        courseRating: { type: 'string', enum: ['high', 'low', 'unreadable'] },
        slopeRating: { type: 'string', enum: ['high', 'low', 'unreadable'] },
      },
    },
    notes: { type: ['string', 'null'], description: 'Short note for the human reviewer about anything ambiguous, cut off, glared, or worth double-checking. Null if the card read cleanly.' },
  },
} as const;

export const EXTRACTION_PROMPT = `You are reading a photograph of an official golf course scorecard so a human can check your reading and then use it for handicap calculations.

Report exactly what is printed. Getting a stroke index wrong silently changes who receives shots on which hole, so accuracy matters far more than completeness.

Rules:
- If a value is not printed on the card, or you cannot read it, return null. Never estimate, calculate, or infer a value that is not visibly printed. This applies especially to Course Rating and Slope Rating, which are often absent from the card — return null rather than a plausible-looking number.
- Stroke index is the column labelled SI, S.I., Index, HCP, HDCP or Handicap. It is a 1-18 ranking of hole difficulty and is NOT the hole number. If you cannot find such a column, return null for every strokeIndex.
- Distances: a card usually prints several tee columns. Pick the one that best matches the requested tee, and say in teeName which column you read. If no tee was requested, read the men's regular/medal tee and name it.
- Report the unit honestly. Many European cards are in metres. If the card does not say, return null for distanceUnit.
- Mark a field's confidence "low" whenever the print is small, blurred, glared or ambiguous, and "unreadable" when you are reporting null because you could not read it.
- Use the notes field to flag anything the reviewer should look at closely.

Return all 18 holes in order, using nulls for any you cannot read.`;

/**
 * Clamp extracted values into legal ranges and fill in missing holes.
 *
 * Structured outputs guarantees the JSON shape but not that the numbers make
 * sense — a smudged "13" can come back as 130. Out-of-range values are dropped
 * to null and flagged rather than silently clamped to something wrong.
 */
export function sanitiseExtraction(raw: RawExtractedScorecard): ExtractedScorecard {
  const inRange = (value: number | null, min: number, max: number): number | null =>
    value !== null && Number.isFinite(value) && value >= min && value <= max ? value : null;

  const byHole = new Map(raw.holes.map((hole) => [hole.holeNo, hole]));

  const holes: ExtractedHole[] = Array.from({ length: 18 }, (_, i) => {
    const holeNo = i + 1;
    const found = byHole.get(holeNo);
    if (!found) {
      return { holeNo, par: null, strokeIndex: null, distance: null, confidence: 'unreadable' };
    }
    const par = inRange(found.par, 3, 6);
    const strokeIndex = inRange(found.strokeIndex, 1, 18);
    const distance = inRange(found.distance, 30, 800);
    // Anything that failed the range check is no longer trustworthy.
    const degraded = (par === null && found.par !== null) || (strokeIndex === null && found.strokeIndex !== null);
    return {
      holeNo,
      par,
      strokeIndex,
      distance,
      confidence: degraded ? 'low' : found.confidence,
    };
  });

  return {
    ...raw,
    // "unknown" is the model telling us it could not read the unit — that is a
    // null to the rest of the app, not a guess.
    distanceUnit:
      raw.distanceUnit === 'yards' || raw.distanceUnit === 'metres' ? raw.distanceUnit : null,
    par: inRange(raw.par, 60, 80),
    courseRating: inRange(raw.courseRating, 55, 85),
    slopeRating: inRange(raw.slopeRating, 55, 155),
    holes,
  };
}

/** What is still missing before the course can be verified. */
export interface MissingSummary {
  blocking: string[];
  warnings: string[];
  canVerify: boolean;
}

/**
 * The honest "what do you still need" check the spec asks for.
 *
 * Blocking items make the handicap maths impossible or wrong. Warnings are
 * things a captain may reasonably choose to live with.
 */
export function summariseMissing(input: {
  courseRating: number | null;
  slopeRating: number | null;
  par: number | null;
  holes: Array<{ holeNo: number; par: number | null; strokeIndex: number | null; distance?: number | null }>;
}): MissingSummary {
  const blocking: string[] = [];
  const warnings: string[] = [];

  if (input.courseRating === null) blocking.push('Course Rating for this tee');
  if (input.slopeRating === null) blocking.push('Slope Rating for this tee');
  if (input.par === null) blocking.push('Total par for this tee');

  const missingPar = input.holes.filter((h) => h.par === null).map((h) => h.holeNo);
  const missingSi = input.holes.filter((h) => h.strokeIndex === null).map((h) => h.holeNo);
  if (missingPar.length) blocking.push(`Par for hole${missingPar.length > 1 ? 's' : ''} ${missingPar.join(', ')}`);
  if (missingSi.length) blocking.push(`Stroke index for hole${missingSi.length > 1 ? 's' : ''} ${missingSi.join(', ')}`);

  // A stroke index used twice silently misallocates shots — always blocking.
  const seen = new Map<number, number[]>();
  for (const hole of input.holes) {
    if (hole.strokeIndex === null) continue;
    seen.set(hole.strokeIndex, [...(seen.get(hole.strokeIndex) ?? []), hole.holeNo]);
  }
  const duplicates = [...seen.entries()].filter(([, holes]) => holes.length > 1);
  for (const [si, holes] of duplicates) {
    blocking.push(`Stroke index ${si} is used on holes ${holes.join(' and ')} — each of 1–18 must appear once`);
  }

  const holePar = input.holes.reduce((sum, h) => sum + (h.par ?? 0), 0);
  if (input.par !== null && missingPar.length === 0 && holePar !== input.par) {
    blocking.push(`The holes add up to par ${holePar} but the tee says par ${input.par}`);
  }

  const missingDistance = input.holes.filter((h) => (h.distance ?? null) === null).map((h) => h.holeNo);
  if (missingDistance.length) {
    warnings.push(
      `Distance missing for ${missingDistance.length} hole${missingDistance.length > 1 ? 's' : ''} — scoring works without it.`,
    );
  }

  return { blocking, warnings, canVerify: blocking.length === 0 };
}
