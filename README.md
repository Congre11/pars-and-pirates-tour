# Pars & Pirates Tour

Live scoring and tour hub for the **Pars & Pirates Golf Tour** — a four-day,
Ryder Cup-style match between **The Pars** and the **Pin High Pirates**, Belek,
Turkey, 28 August – 4 September 2026.

Built mobile-first as an installable PWA. The priority, in order, is: live
scoring that works on a golf course, then everything else.

---

## Try it right now

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. It works immediately with **no database and no
credentials** — demo mode seeds the whole tour into your browser so you can walk
every screen and score a full match. See [SETUP.md](./SETUP.md) to turn on real
multi-phone live scoring.

---

## What's here

| Area | Where |
| --- | --- |
| Scoring engine (all 6 formats, handicaps, match status, points) | `src/lib/scoring/` |
| Test suite (68 tests) | `src/lib/**/*.test.ts` |
| Database schema, RLS, realtime, `set_score` function | `supabase/migrations/` |
| Seeded tour (players, days, courses, itinerary) | `src/lib/seed/` |
| Generated SQL seed | `supabase/seed.sql` (`npm run seed:sql`) |
| Storage layer + realtime + offline queue | `src/lib/data/` |
| Course verification + photo extraction | `src/lib/courses/`, `src/app/admin/courses/[courseId]/verify/` |
| Screens | `src/app/` |
| HNA integration adapter | `src/lib/hna/adapter.ts` |

### Commands

```bash
npm run dev        # development server
npm run build      # production build
npm test           # 68 tests: scoring engine, seeded points, extraction
npm run lint       # eslint
npm run typecheck  # tsc
npm run seed:sql   # regenerate supabase/seed.sql from the TypeScript seed
```

---

## Screens

**Home** — live team score, tappable "Next Course" card that opens the correct
live scorecard, a big Enter Score button, today's schedule and the latest
results.
**Leaderboard** — overall points, the projected final score, and every match
grouped by day with live status.
**Scorecard** — the core screen. "Start Scoring" on any round opens that
round's linked course card directly; nobody picks a course. On Day 3 the format
switches as you walk (H1–6 singles → H7–12 scramble → H13–18 alternate shot) off
one PGA Sultan card. Hole strip, one-tap score entry, strokes received, net
scores, hole winners, running match status and the full card.
**Round / Course** — the day's matches plus the full 18-hole card per tee.
**Itinerary** — all eight days; golf days link into that day's scorecards.
**Formats** — plain-English rules and the exact handicap allowance in force.
**Teams** — rosters, handicaps, points contributed, leading scorer.
**Admin** — players, handicaps, courses, tee times, pairings, rules, itinerary,
score corrections, and the course verification flow below. Protected by a
separate captains' PIN.
**Fines** — the running tab.

---

## How scoring works

### Formats

| Day | Date | Course | Holes | Format | Matches | Per match | Day total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 29 Aug | Faldo Course | 1–18 | 4-Man Team Scramble | 1 | 2 | **2** |
| 2 | 30 Aug | Carya Golf Club | 1–18 | Better Ball Match Play | 2 | 1 | **2** |
| 3 | 1 Sep | PGA Sultan | 1–6 | Singles | 4 | 0.25 | 1 |
| 3 | 1 Sep | PGA Sultan | 7–12 | 2-Man Scramble | 2 | 0.5 | 1 |
| 3 | 1 Sep | PGA Sultan | 13–18 | Alternate Shot | 2 | 0.5 | 1 |
| 4 | 2 Sep | Montgomerie Maxx Royal | 1–18 | Singles Match Play | 4 | 1 | **4** |

**11 points total; 6 wins the tour.** A halved match splits its value exactly —
a 0.25-point singles match halved is 0.125 each. Every match's point value is
editable in **Admin → Pairings**, and `src/lib/seed/seed.test.ts` locks the
structure so a stray edit fails the build rather than the scoreboard.

### Handicaps

```
Course Handicap = Handicap Index × (Slope ÷ 113) + (Course Rating − Par)
Playing Handicap = Course Handicap × format allowance
Match strokes    = the difference, so the lower side plays off scratch
Strokes per hole = allocated by stroke index, wrapping above 18
```

Handicap indexes are supplied by the organiser and entered by hand (Admin →
Players records who changed them and when):

| The Pars | Index | | Pin High Pirates | Index |
| --- | --- | --- | --- | --- |
| Jason Dunbar (C) | 11.3 | | Jordy West (C) | 9.6 |
| Andrew Rushmere | 4.0 | | Connor Grealy | 9.3 |
| Alan Hector | 22.0 | | Nick Georgoulakis | 15.9 |
| Ryan Dahl | 8.8 | | Dan Kramer | 15.0 |

These are **indexes, not course handicaps** — each one is converted per course
and tee before any allowance is applied.

Default allowances (all editable in **Admin → Rules**):

| Format | Allowance |
| --- | --- |
| 4-Man Scramble | 20 / 15 / 10 / 5% (low to high) |
| Better Ball | 90% each |
| Singles | 100% |
| 2-Man Scramble | 35 / 15% |
| Alternate Shot | 50% of combined |

Plus handicaps are supported and give strokes back from the easiest holes.

### Match status

Live status shows `AS` / `2 UP` with holes played; finished matches use proper
golf notation (`3&2`, `1 UP`, `Halved`). Dormie is flagged. A match closes out
the moment the lead exceeds the holes remaining, and the engine will not advance
the status past a hole that has not been scored yet.

---

## Live scoring architecture

```
 Phone A                    Next.js server              Supabase
 ───────                    ──────────────              ────────
 tap a score
   ├─ apply locally (instant, no spinner)
   ├─ append to durable queue in localStorage
   └─ POST /api/scores ──►  check PIN cookie
                            service_role key ──────►   set_score()
                                                        ├─ upsert scores
                                                        └─ append score_events
                                                              │
 Phone B  ◄──────────── Supabase Realtime websocket ◄──────────┘
   └─ row applied straight into the in-memory snapshot, engine reruns
```

- **Reads** go straight to Supabase with the anon key (RLS: select only).
- **Writes** go through this app's API routes, which hold the `service_role` key
  and check the tour PIN cookie first. A leaked anon key cannot alter a score.
- **Conflict protection**: each write carries the `updated_at` the device last
  saw; the database rejects it if someone else changed that hole first. Admins
  bypass this so corrections always land.
- **Audit trail**: `score_events` is append-only. Nothing is ever deleted.
- **Offline**: writes queue durably in `localStorage` and drain in order with
  retries when signal returns. Killing the app does not lose a hole.

The scoring engine is a set of pure functions with no I/O, so the UI, the demo
store and the database all compute identical results.

---

## Data model

`Tour → Team → Player`, `Course → Tee / Hole`, `Round → Match → MatchSide →
Score`, plus `MatchResult`, `ItineraryItem`, `Activity`, `Fine`, `Photo` and the
`ScoreEvent` audit log.

Nothing is hard-coded to one weekend — six-hole and 18-hole matches are just
`start_hole`/`end_hole`, and a new tour is a new `tours` row.

Every `Round` stores `course_id` and `tee_id`, which is what makes the Home
screen's course card open the correct pre-loaded scorecard.

---

## Course verification (the evening before)

**Admin → Courses → Verify with a scorecard photo**, or the warning banner on
any round.

1. Pick the tee you are playing.
2. Photograph the official card (downscaled client-side before upload).
3. Tap **Read the scorecard from this photo** — Claude reads it into editable
   fields. Values it was unsure about are highlighted amber.
4. Correct anything wrong by typing over it.
5. The screen lists exactly what is still missing, and refuses to verify while a
   rating, slope, par or stroke index is absent, a stroke index is duplicated,
   or the holes do not add up to the tee's par.
6. **Confirm & mark course as verified** — the only thing that ever sets
   `data_verified`. Extraction never does, and re-verifying an already-verified
   course asks first.
7. Course handicaps recalculate immediately, everywhere.

The uploaded photo is kept against the course record for reference. Without an
`ANTHROPIC_API_KEY` the photo still uploads and the fields are typed in by hand;
nothing else changes.

## Known gaps

- **Course data is placeholder until verified.** All four courses are seeded
  with complete, internally consistent but *unverified* scorecards so the engine
  works out of the box. They are flagged `data_verified = false` and the app
  warns everywhere until a human verifies them (see below). Do not treat the
  seeded par, stroke index, distance or ratings as the real published cards.
- **The scorecard photo reader has not been run against the live API.** No
  `ANTHROPIC_API_KEY` was available in the build environment, so the request
  shape is type-checked and the surrounding parsing, range-checking and review
  flow are unit tested, but the vision call itself is unexercised. If the
  structured-output schema is rejected the route retries in plain JSON, and if
  both fail the admin types the card in by hand — which is fully supported.
- **HNA is an adapter, not a working integration.** See
  `src/lib/hna/adapter.ts`. No public HNA API was available and no credentials
  were supplied, so nothing was invented and nothing is scraped. The manual
  fallback is complete.
- **Pairings are defaults.** Day 2/3/4 line-ups were listed as captains'
  decisions; balanced defaults are seeded and fully editable.
- Photo gallery has a database table but no upload UI (needs Supabase Storage).
