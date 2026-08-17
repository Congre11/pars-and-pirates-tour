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
| Engine test suite (38 tests) | `src/lib/scoring/engine.test.ts` |
| Database schema, RLS, realtime, `set_score` function | `supabase/migrations/0001_init.sql` |
| Seeded tour (players, days, courses, itinerary) | `src/lib/seed/` |
| Generated SQL seed | `supabase/seed.sql` (`npm run seed:sql`) |
| Storage layer + realtime + offline queue | `src/lib/data/` |
| Screens | `src/app/` |
| HNA integration adapter | `src/lib/hna/adapter.ts` |

### Commands

```bash
npm run dev        # development server
npm run build      # production build
npm test           # scoring engine tests
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
**Scorecard** — the core screen. Hole strip, one-tap score entry, strokes
received, net scores, hole winners, running match status and the full card.
**Round / Course** — the day's matches plus the full 18-hole card per tee.
**Itinerary** — all eight days; golf days link into that day's scorecards.
**Formats** — plain-English rules and the exact handicap allowance in force.
**Teams** — rosters, handicaps, points contributed, leading scorer.
**Admin** — players, handicaps, courses, tee times, pairings, rules, itinerary,
score corrections. Protected by a separate captains' PIN.
**Fines** — the running tab.

---

## How scoring works

### Formats

| Day | Holes | Format | Matches | Points |
| --- | --- | --- | --- | --- |
| 1 — Faldo Course | 1–18 | 4-Man Team Scramble | 1 | 1 |
| 2 — Carya | 1–18 | Better Ball Match Play | 2 | 2 |
| 3 — PGA Sultan | 1–6 | Singles | 4 | 4 |
| 3 — PGA Sultan | 7–12 | 2-Man Scramble | 2 | 2 |
| 3 — PGA Sultan | 13–18 | Alternate Shot | 2 | 2 |
| 4 — Montgomerie | 1–18 | Singles Match Play | 4 | 4 |

**15 points total; 8 wins the tour.** Note that Day 1 is a single team match
worth 1 point while Day 3 is worth 8 — that follows the spec's "1 point per
match" rule. Every match's point value is editable in **Admin → Pairings** if
the captains want the days weighted differently.

### Handicaps

```
Course Handicap = Handicap Index × (Slope ÷ 113) + (Course Rating − Par)
Playing Handicap = Course Handicap × format allowance
Match strokes    = the difference, so the lower side plays off scratch
Strokes per hole = allocated by stroke index, wrapping above 18
```

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

## Known gaps

- **Course data is placeholder.** All four courses are seeded with complete,
  internally consistent but *unverified* scorecards so the engine works out of
  the box. They are flagged `data_verified = false` and the app warns until a
  human checks them in **Admin → Courses**. Do not treat the seeded par, stroke
  index, yardage or ratings as the real published cards.
- **Handicap indexes are blank.** The spec lists them as still to be supplied.
  Enter them in **Admin → Players**; until then players are scored off scratch
  and the app says so.
- **HNA is an adapter, not a working integration.** See
  `src/lib/hna/adapter.ts`. No public HNA API was available and no credentials
  were supplied, so nothing was invented and nothing is scraped. The manual
  fallback is complete.
- **Pairings are defaults.** Day 2/3/4 line-ups were listed as captains'
  decisions; balanced defaults are seeded and fully editable.
- Photo gallery has a database table but no upload UI (needs Supabase Storage).
