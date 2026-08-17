import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import {
  EXTRACTION_PROMPT,
  SCORECARD_SCHEMA,
  sanitiseExtraction,
  summariseMissing,
  type RawExtractedScorecard,
} from '@/lib/courses/extraction';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Reading a scorecard photo is a slow, thinking-heavy request.
export const maxDuration = 120;

const MODEL = 'claude-opus-5';

/** Is the photo-extraction step available on this deployment? */
export async function GET() {
  const configured = Boolean(process.env.ANTHROPIC_API_KEY);
  return NextResponse.json({
    configured,
    message: configured
      ? 'Scorecard photo reading is switched on.'
      : 'No ANTHROPIC_API_KEY is set, so photos cannot be read automatically. You can still upload the photo for reference and type the numbers in yourself.',
  });
}

/**
 * Read an uploaded scorecard photo into editable fields.
 *
 * This endpoint deliberately does NOT write anything to the course. It returns
 * a draft for the admin to review and correct on screen; saving and verifying
 * are separate, explicit actions.
 */
export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Reading photos automatically needs an ANTHROPIC_API_KEY on the server. Without it you can still upload the photo and type the numbers in by hand.',
      },
      { status: 501 },
    );
  }

  let body: { imageData?: string; mimeType?: string; teeHint?: string; courseHint?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const { imageData, mimeType } = body;
  if (!imageData || !mimeType) {
    return NextResponse.json({ error: 'imageData and mimeType are required' }, { status: 400 });
  }
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mimeType)) {
    return NextResponse.json(
      { error: 'Photos must be JPEG, PNG, WebP or GIF.' },
      { status: 400 },
    );
  }

  // Strip a data-URL prefix if the browser sent one.
  const base64 = imageData.includes(',') ? imageData.slice(imageData.indexOf(',') + 1) : imageData;
  // ~4/3 expansion: keep well inside the 32MB request ceiling.
  if (base64.length > 20_000_000) {
    return NextResponse.json({ error: 'That photo is too large. Try a smaller one.' }, { status: 413 });
  }

  const hints = [
    body.courseHint ? `The course should be ${body.courseHint}.` : '',
    body.teeHint ? `Read the distances for the ${body.teeHint} tee if that column is present.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const client = new Anthropic({ apiKey });

  const promptText = hints ? `${EXTRACTION_PROMPT}\n\n${hints}` : EXTRACTION_PROMPT;
  const content = [
    { type: 'image' as const, source: { type: 'base64' as const, media_type: mimeType as 'image/jpeg', data: base64 } },
    { type: 'text' as const, text: promptText },
  ];

  const ask = (structured: boolean) =>
    client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      // Claude Opus 5's safety classifiers can decline a request; a fallback
      // means a false positive on a golf scorecard still returns a result.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      ...(structured
        ? { output_config: { format: { type: 'json_schema' as const, schema: SCORECARD_SCHEMA } } }
        : {}),
      messages: [
        {
          role: 'user' as const,
          content: structured
            ? content
            : [
                content[0],
                {
                  type: 'text' as const,
                  // Without the schema to constrain the shape, ask for it explicitly.
                  text: `${promptText}\n\nReply with JSON only — no prose and no code fences — matching exactly this shape:\n${JSON.stringify(SCORECARD_SCHEMA)}`,
                },
              ],
        },
      ],
    });

  try {
    let response;
    try {
      response = await ask(true);
    } catch (schemaError) {
      // Structured outputs rejects a schema with a 400. Rather than fail the
      // whole feature on a schema quirk, ask again in plain JSON — the reply is
      // parsed and range-checked identically either way.
      if (schemaError instanceof Anthropic.BadRequestError) {
        response = await ask(false);
      } else {
        throw schemaError;
      }
    }

    // A refusal returns HTTP 200 with empty or partial content — check before
    // reading content, or this throws on an index that does not exist.
    if (response.stop_reason === 'refusal') {
      return NextResponse.json(
        { error: 'The photo could not be processed. Please enter the scorecard by hand.' },
        { status: 422 },
      );
    }
    if (response.stop_reason === 'max_tokens') {
      return NextResponse.json(
        { error: 'The reply was cut short. Try a clearer or more tightly cropped photo.' },
        { status: 502 },
      );
    }

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'No scorecard data came back from the reader.' }, { status: 502 });
    }

    let parsed: RawExtractedScorecard;
    try {
      // Tolerate a ```json fence if the unstructured fallback path was used.
      const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
      parsed = JSON.parse(raw) as RawExtractedScorecard;
    } catch {
      return NextResponse.json({ error: 'The reader returned something unreadable.' }, { status: 502 });
    }
    if (!parsed || !Array.isArray(parsed.holes)) {
      return NextResponse.json({ error: 'The reader returned an unexpected shape.' }, { status: 502 });
    }

    const extracted = sanitiseExtraction(parsed);
    const missing = summariseMissing({
      courseRating: extracted.courseRating,
      slopeRating: extracted.slopeRating,
      par: extracted.par,
      holes: extracted.holes,
    });

    return NextResponse.json({ extracted, missing, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Too many requests just now — wait a moment and try again.' }, { status: 429 });
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return NextResponse.json({ error: 'The ANTHROPIC_API_KEY on the server is not valid.' }, { status: 502 });
    }
    if (err instanceof Anthropic.APIConnectionError) {
      return NextResponse.json({ error: 'Could not reach the reading service. Check the connection.' }, { status: 502 });
    }
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `Could not read the photo (${err.status}).` }, { status: 502 });
    }
    return NextResponse.json({ error: 'Could not read the photo.' }, { status: 500 });
  }
}
