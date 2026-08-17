/**
 * Deterministic UUID generation for seed data.
 *
 * The seed lives in TypeScript and is used in two places: the browser's demo
 * store and the generated `supabase/seed.sql`. Both must agree on every id, so
 * ids are derived from a stable string key rather than randomly generated.
 * Re-running the seed generator therefore produces byte-identical output and
 * re-seeding a database is idempotent.
 */

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function hex8(value: number): string {
  return value.toString(16).padStart(8, '0');
}

/** A deterministic RFC-4122-shaped UUID (version 4, variant 8) for `key`. */
export function stableId(key: string): string {
  const a = hex8(fnv1a(key, 0x811c9dc5));
  const b = hex8(fnv1a(key, 0x1000193));
  const c = hex8(fnv1a(key, 0x9e3779b9));
  const d = hex8(fnv1a(key, 0x85ebca6b));
  return [
    a,
    b.slice(0, 4),
    `4${b.slice(5, 8)}`,
    `8${c.slice(1, 4)}`,
    `${c.slice(4, 8)}${d}`,
  ].join('-');
}
