import { describe, expect, it } from 'vitest';
import {
  SCORECARD_SCHEMA,
  sanitiseExtraction,
  summariseMissing,
  type RawExtractedScorecard,
} from './extraction';

/**
 * The scorecard reader itself needs a photo and an API key, so what is tested
 * here is everything around it: the schema's shape, the range checking that
 * stops a misread digit becoming a wrong stroke index, and the "what do you
 * still need" summary that gates the verify button.
 */

const CLEAN_HOLES = Array.from({ length: 18 }, (_, i) => ({
  holeNo: i + 1,
  par: 4,
  strokeIndex: i + 1,
  distance: 400,
  confidence: 'high' as const,
}));

function raw(overrides: Partial<RawExtractedScorecard> = {}): RawExtractedScorecard {
  return {
    courseName: 'Carya Golf Course',
    teeName: 'Yellow',
    teeColour: '#f2c53d',
    distanceUnit: 'metres',
    par: 72,
    courseRating: 71.3,
    slopeRating: 132,
    holes: CLEAN_HOLES,
    confidence: {
      courseName: 'high',
      teeName: 'high',
      distanceUnit: 'high',
      par: 'high',
      courseRating: 'high',
      slopeRating: 'high',
    },
    notes: null,
    ...overrides,
  };
}

describe('the response schema', () => {
  it('locks every object down so the model cannot invent fields', () => {
    const walk = (node: Record<string, unknown>, path: string) => {
      if (node.type === 'object') {
        expect(node.additionalProperties, `${path} allows extra properties`).toBe(false);
        expect(node.required, `${path} has no required list`).toBeDefined();
        const properties = node.properties as Record<string, Record<string, unknown>>;
        expect(Object.keys(properties).sort()).toEqual([...(node.required as string[])].sort());
        for (const [key, child] of Object.entries(properties)) walk(child, `${path}.${key}`);
      }
      if (node.type === 'array') walk(node.items as Record<string, unknown>, `${path}[]`);
    };
    walk(SCORECARD_SCHEMA as unknown as Record<string, unknown>, 'root');
  });

  it('avoids the constraint keywords structured outputs does not support', () => {
    const json = JSON.stringify(SCORECARD_SCHEMA);
    for (const keyword of ['minimum', 'maximum', 'minLength', 'maxLength', 'multipleOf', 'pattern']) {
      expect(json, `schema uses unsupported keyword ${keyword}`).not.toContain(`"${keyword}"`);
    }
  });
});

describe('sanitiseExtraction', () => {
  it('passes a clean card through unchanged', () => {
    const result = sanitiseExtraction(raw());
    expect(result.courseRating).toBe(71.3);
    expect(result.slopeRating).toBe(132);
    expect(result.distanceUnit).toBe('metres');
    expect(result.holes).toHaveLength(18);
    expect(result.holes[0]).toMatchObject({ holeNo: 1, par: 4, strokeIndex: 1, distance: 400 });
  });

  it('turns "unknown" units into null rather than guessing', () => {
    expect(sanitiseExtraction(raw({ distanceUnit: 'unknown' })).distanceUnit).toBeNull();
    expect(sanitiseExtraction(raw({ distanceUnit: null })).distanceUnit).toBeNull();
  });

  it('drops an out-of-range stroke index and downgrades its confidence', () => {
    const holes = [...CLEAN_HOLES];
    // A smudged "13" read as "130".
    holes[1] = { ...holes[1], strokeIndex: 130, confidence: 'high' };
    const result = sanitiseExtraction(raw({ holes }));
    expect(result.holes[1].strokeIndex).toBeNull();
    expect(result.holes[1].confidence).toBe('low');
  });

  it('drops an impossible par', () => {
    const holes = [...CLEAN_HOLES];
    holes[0] = { ...holes[0], par: 44 };
    const result = sanitiseExtraction(raw({ holes }));
    expect(result.holes[0].par).toBeNull();
    expect(result.holes[0].confidence).toBe('low');
  });

  it('rejects an implausible rating or slope instead of storing it', () => {
    const result = sanitiseExtraction(raw({ courseRating: 713, slopeRating: 1320 }));
    expect(result.courseRating).toBeNull();
    expect(result.slopeRating).toBeNull();
  });

  it('fills in holes the reader skipped entirely', () => {
    const result = sanitiseExtraction(raw({ holes: CLEAN_HOLES.slice(0, 9) }));
    expect(result.holes).toHaveLength(18);
    expect(result.holes[17]).toMatchObject({
      holeNo: 18,
      par: null,
      strokeIndex: null,
      confidence: 'unreadable',
    });
  });

  it('never invents a rating that was not on the card', () => {
    const result = sanitiseExtraction(raw({ courseRating: null, slopeRating: null }));
    expect(result.courseRating).toBeNull();
    expect(result.slopeRating).toBeNull();
  });
});

describe('summariseMissing', () => {
  const holes = CLEAN_HOLES.map((h) => ({ ...h }));

  it('clears a complete card for verification', () => {
    const result = summariseMissing({ courseRating: 71.3, slopeRating: 132, par: 72, holes });
    expect(result.blocking).toEqual([]);
    expect(result.canVerify).toBe(true);
  });

  it('blocks on a missing course rating and says so by name', () => {
    const result = summariseMissing({ courseRating: null, slopeRating: 132, par: 72, holes });
    expect(result.canVerify).toBe(false);
    expect(result.blocking.join(' ')).toContain('Course Rating');
  });

  it('blocks on a missing slope', () => {
    const result = summariseMissing({ courseRating: 71.3, slopeRating: null, par: 72, holes });
    expect(result.canVerify).toBe(false);
    expect(result.blocking.join(' ')).toContain('Slope Rating');
  });

  it('names the holes whose stroke index is missing', () => {
    const gappy = holes.map((h) => (h.holeNo === 4 || h.holeNo === 9 ? { ...h, strokeIndex: null } : h));
    const result = summariseMissing({ courseRating: 71.3, slopeRating: 132, par: 72, holes: gappy });
    expect(result.canVerify).toBe(false);
    expect(result.blocking.join(' ')).toContain('Stroke index for holes 4, 9');
  });

  it('blocks a duplicated stroke index — the silent shot-misallocation bug', () => {
    const duplicated = holes.map((h) => (h.holeNo === 2 ? { ...h, strokeIndex: 1 } : h));
    const result = summariseMissing({
      courseRating: 71.3,
      slopeRating: 132,
      par: 72,
      holes: duplicated,
    });
    expect(result.canVerify).toBe(false);
    expect(result.blocking.join(' ')).toContain('Stroke index 1 is used on holes 1 and 2');
  });

  it('blocks when the holes do not add up to the tee par', () => {
    const result = summariseMissing({ courseRating: 71.3, slopeRating: 132, par: 71, holes });
    expect(result.canVerify).toBe(false);
    expect(result.blocking.join(' ')).toContain('add up to par 72 but the tee says par 71');
  });

  it('treats a missing distance as a warning, not a blocker', () => {
    const noDistance = holes.map((h) => ({ ...h, distance: null }));
    const result = summariseMissing({
      courseRating: 71.3,
      slopeRating: 132,
      par: 72,
      holes: noDistance,
    });
    expect(result.canVerify).toBe(true);
    expect(result.warnings.join(' ')).toContain('Distance missing');
  });
});
