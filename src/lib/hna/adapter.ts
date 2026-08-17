import 'server-only';

/**
 * Handicaps Network Africa (HNA) integration adapter.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE ASSUMING THIS WORKS.
 *
 * The build spec is explicit: "Claude must not invent an HNA API" and "do not
 * claim integration works until confirmed". At the time of writing there is no
 * public, documented HNA API available to build against, and no credentials
 * were supplied.
 *
 * So this file is deliberately an ADAPTER, not an integration:
 *
 *   • It is inert unless HNA_API_BASE_URL and HNA_API_KEY are both set.
 *   • It does no scraping. It will not log in to a member portal, parse HTML
 *     or pretend a handicap it could not fetch.
 *   • The request shape below is a PLACEHOLDER. It must be checked against
 *     whatever HNA actually documents once official access is granted; the one
 *     function to change is `fetchHandicapIndex`.
 *
 * Until then the app uses manually entered handicap indexes, which is fully
 * supported: every screen, every calculation and every scorecard works exactly
 * the same. The only difference is that a human types the number in Admin
 * instead of it arriving over the wire.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface HnaLookupResult {
  hnaId: string;
  handicapIndex: number | null;
  /** Whatever the provider says the index was last revised. */
  asOf: string | null;
  error?: string;
}

export function isHnaConfigured(): boolean {
  return Boolean(process.env.HNA_API_BASE_URL && process.env.HNA_API_KEY);
}

export function hnaStatus(): { configured: boolean; message: string } {
  if (isHnaConfigured()) {
    return {
      configured: true,
      message:
        'HNA credentials are present. The request shape in src/lib/hna/adapter.ts still needs to be confirmed against HNA’s official documentation before the numbers can be trusted.',
    };
  }
  return {
    configured: false,
    message:
      'No HNA credentials configured. Handicap indexes are entered by hand in Admin → Players, which the app fully supports.',
  };
}

/**
 * Fetch one player's current Handicap Index.
 *
 * PLACEHOLDER CONTRACT — confirm with HNA before relying on it. Adjust the URL,
 * the auth header and the response parsing to match their documentation. The
 * rest of the app talks to this function and nothing else, so this is the only
 * place that needs to change.
 */
export async function fetchHandicapIndex(hnaId: string): Promise<HnaLookupResult> {
  const baseUrl = process.env.HNA_API_BASE_URL;
  const apiKey = process.env.HNA_API_KEY;

  if (!baseUrl || !apiKey) {
    return {
      hnaId,
      handicapIndex: null,
      asOf: null,
      error: 'HNA is not configured. Enter the handicap index manually in Admin → Players.',
    };
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/members/${encodeURIComponent(hnaId)}`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
        },
        // Never serve a stale handicap from a cache before a round.
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!response.ok) {
      return {
        hnaId,
        handicapIndex: null,
        asOf: null,
        error: `HNA responded ${response.status}. Check the member number and the API contract.`,
      };
    }

    const body: unknown = await response.json();
    const record = body as Record<string, unknown>;

    // Accept a few plausible field names rather than guessing exactly one.
    const rawIndex =
      record.handicapIndex ?? record.handicap_index ?? record.index ?? record.hcp ?? null;
    const parsed = typeof rawIndex === 'string' ? Number(rawIndex) : rawIndex;
    const handicapIndex =
      typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null;

    if (handicapIndex === null) {
      return {
        hnaId,
        handicapIndex: null,
        asOf: null,
        error:
          'HNA replied but no handicap index field was recognised. Update fetchHandicapIndex() to match their documented response.',
      };
    }

    const asOfRaw = record.asOf ?? record.as_of ?? record.updatedAt ?? record.revision_date ?? null;

    return {
      hnaId,
      handicapIndex,
      asOf: typeof asOfRaw === 'string' ? asOfRaw : null,
    };
  } catch (err) {
    return {
      hnaId,
      handicapIndex: null,
      asOf: null,
      error: err instanceof Error ? `Could not reach HNA: ${err.message}` : 'Could not reach HNA.',
    };
  }
}
