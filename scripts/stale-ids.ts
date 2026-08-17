/**
 * Prints the deterministic ids of seed rows that have been removed from the
 * seed, so a migration can delete them from a database that already has them.
 *
 * Run with: npx tsx scripts/stale-ids.ts
 */
import { stableId } from '../src/lib/seed/ids';

// Day 3 was re-specified as Scramble / Shamble / Better Ball. These are the
// keys of the matches it used to have.
const STALE_MATCH_KEYS = ['d3-s1', 'd3-s2', 'd3-s3', 'd3-s4', 'd3-f1', 'd3-f2'];

for (const key of STALE_MATCH_KEYS) {
  console.log(`  '${stableId(`match:${key}`)}',  -- ${key}`);
}
