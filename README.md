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
| Test suite (221 tests) | `src/lib/**/*.test.ts` |
| Database schema, RLS, realtime, `set_score` function | `supabase/migrations/` |
| Round format plan + validation | `src/lib/rounds/format-plan.ts` |
| 4-ball grouping + validation | `src/lib/rounds/four-balls.ts` |
| Matchup sections + validation | `src/lib/rounds/matchups.ts` |
| Pairings derived from the 4-balls | `src/lib/rounds/derived-pairings.ts` |
| Pairing confirmation state | `src/lib/rounds/confirmation.ts` |
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
npm test           # 221 tests: scoring, points, formats, 4-balls, matchups
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
round's linked course card directly; nobody picks a course. Where a round is
configured with several formats the card switches as you walk — Day 3 ships as
H1–6 scramble → H7–12 shamble → H13–18 better ball off one PGA Sultan card,
read from the match rows rather than hard-coded. Hole strip, one-tap score
entry, strokes received, net scores, hole winners, running match status and the
full card.
**Round / Course** — the day's matches plus the full 18-hole card per tee, with
**Edit 4-balls** and a per-section **Edit matchups** on every round.
**4-balls** — who walks round with whom. Editable by every player.
**Matchups** — who plays whom, edited per hole range. Editable by every player.
**Itinerary** — all eight days; golf days link into that day's scorecards.
**Formats** — plain-English rules and the exact handicap allowance in force.
**Teams** — rosters, handicaps, points contributed, leading scorer.
**Tour settings** — players, handicaps, courses, tee times, formats & pairings,
rules, itinerary and the course verification flow below. Set up once before the
tour; nothing here is needed to play.
**Fines** — the running tab.

---

## How scoring works

### Formats

| Day | Date | Course | Holes | Format | Matches | Per match | Day total |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 29 Aug | Faldo — Queen’s + Prince’s | 1–18 | 2-Man Scramble | 2 | 1 | **2** |
| 2 | 30 Aug | Carya Golf Club | 1–18 | Better Ball Match Play | 2 | 1 | **2** |
| 3 | 1 Sep | PGA Sultan | 1–6 | 2-Man Scramble | 2 | 0.5 | 1 |
| 3 | 1 Sep | PGA Sultan | 7–12 | Shamble | 2 | 0.5 | 1 |
| 3 | 1 Sep | PGA Sultan | 13–18 | Better Ball | 2 | 0.5 | 1 |
| 4 | 2 Sep | Montgomerie Maxx Royal | 1–18 | Singles Match Play | 4 | 1 | **4** |

**11 points total; 6 wins the tour.** A halved match normally splits its value
exactly — a 1-point match halved is 0.5 each.

**Day 3 is the exception.** A halved Day 3 match awards **nothing to either
side** and its half point is burned. The tour stays advertised as 11 points
with 6 to win: the point goes unclaimed rather than reducing what was on offer,
so a team can take the trophy on fewer than 6, or nobody reaches it. The rule
is keyed on the round's *shape* — more than one hole range — rather than on a
day number, which is the same signature the derived pairings use.

`src/lib/seed/seed.test.ts` locks the seeded structure and both rules, so a
stray edit fails the build rather than the scoreboard.

**This table is the seeded default, not a fixture.** Day 3's three-format shape
is six ordinary match rows, exactly like every other day. In
**Tour settings → Formats & pairings** you can change any match's format, first
and last hole, points value and handicap allowance, and add or delete matches
entirely; **who plays whom** is edited on the round itself by anyone. The live scorecard and the scoring engine read the same rows, so a
change lands on every phone in seconds without a code change or a deploy. See
[Reconfiguring a round](#reconfiguring-a-round) below.

### Handicaps

```
Course Handicap = Handicap Index × (Slope ÷ 113) + (Course Rating − Par)
Playing Handicap = Course Handicap × format allowance
Match strokes    = the difference, so the lower side plays off scratch
Strokes per hole = allocated by stroke index, wrapping above 18
```

Three details that matter on this tour:

- **Pairs play off one handicap, rounded twice.** A scramble or shamble pair
  play off `floor(floor((CH1 + CH2) / 2) × 0.8)`: average the two course
  handicaps, round *down*, then take 80% and round down again. The two
  roundings are not interchangeable with one — course handicaps 13 and 12 give
  9 by the rule and 10 if folded into a single 40% stage.
- **Nobody ever plays off zero.** Match play normally subtracts the lowest
  handicap in the match. This tour does not, in any format:
  - a scramble or shamble pair on 16 against a pair on 9 plays **16 against 9**,
    not 7 against 0, and both receive strokes;
  - better-ball course handicaps 4, 11, 15 and 22 play as **4 / 11 / 15 / 22**,
    not 0 / 7 / 11 / 18;
  - singles on 8 and 13 play **8 against 13**, not 0 against 5.

  For the pair formats the totals still come to the same difference, but the
  per-hole shape does not, because each side is dealt its own strokes
  independently. That is intended. A consequence worth knowing: the
  `handicapMode` setting is now inert — it can only reach the two formats this
  tour never plays.
- **Six-hole matches allocate over six holes.** Day 3's blocks deal each side's
  *whole* handicap across the holes actually being played, ranked by those
  holes' own stroke index — so a side on 16 over holes 1–6 receives all 16, not
  the few that happened to carry a low SI on the full card.

Handicap indexes are supplied by the organiser and entered by hand (Tour
settings → Players records who changed them and when):

| The Pars | Index | | Pin High Pirates | Index |
| --- | --- | --- | --- | --- |
| Jason Dunbar (C) | 11.3 | | Jordy West (C) | 9.6 |
| Andrew Rushmere | 4.0 | | Connor Grealy | 9.3 |
| Alan Hector | 22.0 | | Nick Georgoulakis | 15.9 |
| Ryan Dahl | 8.8 | | Dan Kramer | 15.0 |

These are **indexes, not course handicaps** — each one is converted per course
and tee before any allowance is applied.

Default allowances (editable in **Tour settings → Rules** for every match of
that format, or per match in **Tour settings → Formats & pairings**):

| Format | Allowance | |
| --- | --- | --- |
| 2-Man Scramble | `floor(floor((CH1 + CH2) / 2) × 0.8)` — **both** pairs keep their own | **fixed** |
| Shamble | the same figure — one team handicap, both balls net against it | **fixed** |
| Better Ball | 100% each, **in full** — 4, 11, 15, 22 play as 4 / 11 / 15 / 22 | **fixed** |
| Singles | 100% each, **in full** — 8 against 13 plays 8 against 13 | **fixed** |
| 4-Man Scramble | 20 / 15 / 10 / 5% (low to high) — unused by this tour | editable |
| Alternate Shot | 50% of combined | editable |

**The four marked "fixed" are set in code (`FIXED_ALLOWANCES` in `src/lib/types.ts`), not
in settings.** They used to be editable and stored, which meant a settings record
written before the rules were agreed silently kept overriding them: the scoreboard
showed a scramble pair off `Team 9` instead of `Team 20` with nothing in the code
wrong and nothing on screen to say why. `allowanceFor()` now returns the rule
regardless of what is stored, and regardless of any per-match override — an override
is persisted data too, and carries the same risk. Changing one of these four is a
code change and a deploy, deliberately.

Plus handicaps are supported and give strokes back from the easiest holes.

### Match status

Live status shows `AS` / `2 UP` with holes played; finished matches use proper
golf notation (`3&2`, `1 UP`, `Halved`). Dormie is flagged. A match closes out
the moment the lead exceeds the holes remaining, and the engine will not advance
the status past a hole that has not been scored yet.

---

## Reconfiguring a round

A round is a list of matches. Each match carries a format, a first and last
hole, a matchup, a points value and — optionally — its own handicap allowance.
There is no separate notion of a "day type", and nothing in the code knows that
Day 3 is unusual.

**Tour settings → Formats & pairings** shows, per round:

- a **coverage bar** of holes 1–18 coloured by which match covers each one, so
  gaps and overlaps are visible before anyone tees off;
- the round's format **derived from its matches**, with a one-tap prompt to
  relabel the round when the two have drifted apart;
- the **points at stake** for the day, recalculated as you edit;
- **validation**, which distinguishes what will break the scorecard from what is
  merely unusual:

| Reported as | Example |
| --- | --- |
| Error | Two matches cover the same hole for the same player — one of them would silently never be scored |
| Error | A hole range runs off the end of the card, or ends before it starts |
| Error | A match has fewer than two sides, or the same player on both sides |
| Warning | A side has the wrong number of players for its format |
| Warning | No match covers some holes, so nothing is scored there |

Adding a match creates it with two empty sides over whatever holes are still
free. Deleting one asks first, and says how many entered scores it would take
with it.

The live scorecard derives its segments from these rows at render time
(`src/app/round/[roundId]/score/page.tsx`), so re-ranging Day 3 to 4/8/6 holes,
or turning Day 4 into two nine-hole formats, needs no code change. The rules
themselves live in `src/lib/rounds/format-plan.ts` as pure functions, tested in
`format-plan.test.ts` against configurations that are nothing like the seeded
one.

---

## 4-balls vs matchups

Two different things, stored in two different tables, on purpose.

| | **4-ball** (`round_groups`) | **Match** (`matches`) |
| --- | --- | --- |
| Answers | Who do I walk round with? | Who am I playing against? |
| Changes | Day to day, often on the first tee | Set before the round by the organiser |
| Edited by | **Anyone** | **Anyone** |
| Submitted by | **Anyone — one person is enough** | **Anyone — one person is enough** |
| Where | Round → Edit 4-balls | Round → Edit matchups |

They coincide on a better-ball day — one 4-ball is one match — and diverge
everywhere else. A Day 4 singles 4-ball contains two separate matches. On Day 3
the group stays together for all 18 holes while the format changes three times
underneath it, and each six-hole section can be paired differently. Nothing
assumes they line up, and changing one never rewrites the other.

**Matchups are edited per hole range — except when the 4-balls *are* the
matchups.** `sectionsForRound` groups a round's matches by their start/end
holes, so a normal day offers one section and Day 3 offers three.

On a round with more than one section the same people stay in the same buggy
for all 18 holes and only the format changes, so editing three separate sets of
pairings is both tedious and a way to end up with holes 7–12 quietly
disagreeing with holes 1–6. `src/lib/rounds/derived-pairings.ts` therefore
derives the pairings from the 4-balls:

```
4-ball   =  the four people playing together
            inside it, the 2 Pars are one side and the 2 Pirates the other
section  =  a hole range with its own format
```

One 4-ball becomes one match in every section, with the same two sides. Move
somebody and all three sections follow; the handicaps recompute from whoever is
actually in the pairing. It is **one submission for the whole 18 holes**, made
on the 4-ball screen, and the matchups screen shows those sections read-only.

The derivation is deliberately conservative and returns a *reason* rather than
guessing: a single-section round, an unequal team split, or sections that hold
different numbers of matches all fall back to the ordinary per-section editor.
That keeps Day 4 correct, where one 4-ball holds two singles matches and a
2-Pars-versus-2-Pirates split would be wrong.

Rules enforced on the 4-ball editor (`src/lib/rounds/four-balls.ts`):

| Reported as | Rule |
| --- | --- |
| Error | A player is in more than one 4-ball |
| Error | A player is in no 4-ball |
| Error | A 4-ball does not have exactly four players |
| Warning | A 4-ball is not two from each team |

Neither level blocks saving, but an imperfect grouping requires a second,
explicit "Save anyway" — the captains occasionally want a lopsided group and
the app should not argue with them, only make sure it was deliberate.

Tapping a player then another **swaps** them, which is why the editor can never
pass through a state where a group has three or five players by accident.

---

## Permissions

**There are none, and that is deliberate.** The app has no PINs and no roles.
Anyone with the private Vercel link opens it, picks their name, and can use
every part of it.

| | Anyone with the link |
| --- | --- |
| Open the app | ✅ |
| Enter and correct scores | ✅ |
| Edit the 4-balls | ✅ |
| Edit who plays whom | ✅ |
| Tour settings (handicaps, courses, formats, rules) | ✅ |

The security model is therefore: **the URL is the secret.** Do not post the
link anywhere public. `players.is_organiser` and `players.is_captain` still
exist, but purely as labels shown on the Teams screen — nothing reads them to
decide access, and nothing ever did.

What replaces permissions is *separation and confirmation*, so that opening
everything up does not make it easy to break something by accident:

- **Day-to-day things are on the round**: 4-balls and matchups. Nothing else is
  needed to play.
- **Set-up things are behind More → Tour settings**: handicaps, courses, tee
  choices, formats, points, rules. You go there deliberately.
- **The matchup editor writes one column plus a confirmation.** `/api/matchups`
  only ever updates `match_sides.player_ids` and the two
  `matches.pairings_confirmed_*` columns, so the screen everyone uses cannot
  change a format, a hole range or a points value even if it wanted to.
- **Pairings are submitted, not approved.** Both editors have a Save and a
  Submit. Submitting stamps `confirmed_at` / `confirmed_by`, and **one person
  is enough** — nothing counts votes. Any later plain save clears the stamp,
  because what was agreed is no longer what is on the screen. The round screen
  shows the three states (`not-set` / `draft` / `confirmed`) per section, so
  Day 3's three six-hole blocks are submitted independently. See
  `src/lib/rounds/confirmation.ts`.
- **Destructive actions confirm.** Wiping the scores is on the settings screen
  behind an explicit confirmation, and `score_events` keeps the audit trail
  regardless.
- **Completed holes are closed, not locked.** A hole the match has moved past
  needs a deliberate "correct this hole" tap first — a guard against a pocket
  tap, not a permission.

Writes still go through this app's own API routes holding the `service_role`
key; the anon key can only ever `select`, so a leaked key cannot write anything.

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
