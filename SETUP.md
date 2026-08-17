# Setting up the Pars & Pirates Tour app

Written for someone who does not write code. Nothing here needs a terminal
except the very last optional section.

There are two stages:

- **Stage 1 — look at it.** Works immediately, no accounts, no setup.
- **Stage 2 — switch on real live scoring.** About 30 minutes, one free
  Supabase account and one free Vercel account.

You need Stage 2 before the tour, because Stage 1 keeps scores on one phone
only.

---

## Stage 1 — Look at the app (demo mode)

If someone has already given you a link, just open it on your phone. Otherwise a
developer runs `npm install` then `npm run dev` and opens the address it prints.

In demo mode everything works — you can score a whole match, watch the
leaderboard move, edit handicaps and pairings — but **the scores live only in
that one browser**. Two phones will not see each other. That is the only
difference.

The app shows a gold **DEMO** badge in the top-right while this is the case.

---

## Stage 2 — Switch on live scoring

### What you are doing, in plain terms

The app needs somewhere shared to keep the scores so all eight phones see the
same thing. That shared place is a free service called **Supabase**. You also
need somewhere to put the app itself so people can open it from a link — that is
**Vercel**, also free.

### Step 1 — Create the database (10 minutes)

1. Go to <https://supabase.com> and sign up. It is free.
2. Click **New project**. Name it `pars-and-pirates`. Choose a region near
   Turkey or the UK (e.g. `eu-west-2` London or `eu-central-1` Frankfurt).
3. Set a database password. **Write it down somewhere safe.**
4. Wait about two minutes for the project to finish building.

### Step 2 — Create the tables (5 minutes)

1. In the Supabase menu on the left, click **SQL Editor**, then **New query**.
2. Open the file `supabase/migrations/0001_init.sql` from this project.
   Copy **everything** in it and paste it into the box.
3. Click **Run**. You should see "Success. No rows returned".
4. Click **New query**, then do the same with
   `supabase/migrations/0002_course_verification.sql`, and again for
   `supabase/migrations/0003_editable_formats.sql` and
   `supabase/migrations/0004_four_balls_and_organiser.sql` and
   `supabase/migrations/0005_shamble_and_routing.sql`. Run them in number order.
5. Click **New query** one more time.
6. Open `supabase/seed.sql`, copy everything, paste, and click **Run**.
   This one prints a small table at the bottom. Check it says:

   ```
   teams 2 · players 8 · courses 4 · holes 72 · rounds 4 · matches 13 · itinerary 31
   ```

   That is your whole tour loaded: both teams, all eight players with their
   handicap indexes, four golf days, four courses with 18 holes each, and the
   full eight-day itinerary.

### Step 3 — Copy your keys (2 minutes)

Still in Supabase, click the **gear icon (Project Settings)** at the bottom of
the left menu.

- Under **Data API**, copy the **Project URL**. It looks like
  `https://abcdefgh.supabase.co`.
- Under **API Keys**, copy the **anon / public** key. It is a very long string.
- On the same page reveal and copy the **service_role** key. It is also very
  long.

> ⚠️ The **service_role** key is a master key to your database. Never paste it
> into a chat, an email, a screenshot or the app itself. It only ever goes into
> the Vercel settings in the next step.

### Step 4 — Put the app online (10 minutes)

1. Go to <https://vercel.com> and sign up with your GitHub account.
2. Click **Add New → Project** and pick this repository.
3. Before clicking Deploy, open **Environment Variables** and add these five.
   Copy the names exactly.

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL from Step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
   | `SESSION_SECRET` | a long random string (see below) |
   | `ANTHROPIC_API_KEY` | optional — lets the app read scorecard photos |

   For `SESSION_SECRET`, mash the keyboard for 40+ characters, or use a password
   generator. It does not need to be memorable — you never type it again.

4. Click **Deploy**. After a couple of minutes Vercel gives you a link like
   `https://pars-and-pirates-tour.vercel.app`.

### Step 5 — Check it worked (1 minute)

1. Open your new link and pick your name. There is no PIN.
2. Tap **More → Setup checklist**.
3. Every line under "Connections" should have a green tick, and the gold
   **DEMO** badge should now say **LIVE**.

If something is red, that line tells you exactly which value is missing.

---

## Before the tour — the four things that matter

Open **More → Tour settings**. There is no PIN — anyone can get in.

### 1. Handicap indexes — already done

All eight current HNA indexes are already loaded:

| The Pars | | Pin High Pirates | |
| --- | --- | --- | --- |
| Jason Dunbar | 11.3 | Jordy West | 9.6 |
| Andrew Rushmere | 4.0 | Connor Grealy | 9.3 |
| Alan Hector | 22.0 | Nick Georgoulakis | 15.9 |
| Ryan Dahl | 8.8 | Dan Kramer | 15.0 |

If any change before the tour, edit them in **Tour settings → Players**. These are
handicap *indexes*, not course handicaps — the app works out each player's
course handicap separately for every course and tee, which is why the numbers
you see on a scorecard are not the same as the numbers above.

Use a negative number for a plus handicap (type `-1.4` for a player off +1.4).

### 2. Verify each course — the one job left

Each of the four courses was seeded with a *made-up but sensible* scorecard so
the app works out of the box. **These are not the real scorecards**, and the app
says so on every screen until you check them.

**Do this the evening before each round.** It takes a couple of minutes.

1. Open the round (or **Tour settings → Courses**) and tap **Verify with a scorecard
   photo**.
2. Choose the tee you are playing.
3. Take a photo of the real card at the pro shop. Lay it flat, fill the frame,
   and make sure the par, stroke index and distance rows are readable.
4. Tap **Read the scorecard from this photo**. The app fills the boxes in for
   you and highlights in amber anything it was unsure about. *Nothing is saved
   at this point.*
5. Check every value against the card in your hand and correct anything wrong
   by typing over it. Pay particular attention to the **stroke index** column —
   getting one wrong quietly changes who gets a shot on which hole.
6. The screen lists anything still missing. It will not let you verify while a
   rating, slope, par or stroke index is absent, a stroke index is used twice,
   or the holes do not add up to the tee's par.
7. Press **Confirm & mark course as verified**.

Every player's course handicap for that round recalculates straight away, the
warnings disappear, and the photo stays attached to the course for reference.

If the reader is not switched on (no `ANTHROPIC_API_KEY`), everything above
still works — you upload the photo and type the numbers in yourself.

### 3. Tees

**Tour settings → Rounds.** Pick which tees you are playing on each day. This changes
everyone's course handicap, so do it before Day 1.

### 4. Formats and pairings

**Tour settings → Formats & pairings.** The app ships with balanced default line-ups and
the format plan you asked for. Change any of it whenever the captains decide —
changes appear on everyone's phone within seconds, so you can do the big reveal
live.

Each day is a list of **matches**. A match is simply: a format, the holes it
covers, who is playing, what it is worth, and (if you want) its own handicap
allowance. Tap a match to change any of those.

**Nothing about Day 3 is fixed.** It is set up as singles over holes 1–6, a
two-man scramble over 7–12 and alternate shot over 13–18 because that is what
you asked for — but it is stored the same way as every other day. If the
captains decide on the night to play 1–9 better ball and 10–18 alternate shot
instead, you change it here in about a minute and the scorecards follow. Nobody
needs to touch any code.

Above each day you get:

- a **coloured bar** showing which format covers which holes, so gaps and
  clashes are obvious at a glance;
- the **points at stake** that day, which updates as you edit;
- a **plain-English list of anything wrong**. Red means the scorecard will
  misbehave until you fix it — most often two matches covering the same hole for
  the same player. Amber means it is unusual but will still work, e.g. holes
  nobody is matched on.

To add a match, tap **+ Add a match to Day _n_** — it appears covering whatever
holes are still free, and you pick the players. To remove one, open it and tap
**Remove this match**; it asks first, and warns you if scores have already been
entered against it.

> **Handicap allowance per match.** Normally a match uses the allowance for its
> format from **Admin → Rules**, so changing "2-man scramble" there changes every
> scramble. If you want one hole range to play off something different, open
> that match and switch on **Handicap allowance**. It starts from the current
> default, so switching it on changes nothing until you actually edit a number.

---

## Who can do what

**Everyone can do everything.** There are no PINs and no roles. Anyone with the
Vercel link opens the app, picks their name, and can use every part of it —
score, rearrange the 4-balls, change who is playing whom, edit handicaps, verify
courses.

That means **the link is the password.** Send it to the eight of you and do not
post it anywhere public.

Connor Grealy is still marked as the **organiser** and Jason Dunbar and Jordy
West as **captains** — you will see `ORG` and `C` next to their names on the
Teams screen. Those are labels so everyone knows who is who. They do not control
what anyone can do.

Things are kept apart rather than locked:

- **What you change on the day** — 4-balls and matchups — is on the round
  itself.
- **What you set up once** — handicaps, courses, tees, formats, points, rules —
  is behind **More → Tour settings**, so you never wander into it by accident.
- **Wiping the scores** asks you to confirm first, and the audit trail survives
  it either way.

---

## The daily 4-balls

**Open the day → tap Edit 4-balls.**

The round screen lists both groups by name, so you can see the day's grouping
without tapping anything:

| 4-Ball 1 | 4-Ball 2 |
| --- | --- |
| Jason Dunbar | Andrew Rushmere |
| Alan Hector | Ryan Dahl |
| Jordy West | Nick Georgoulakis |
| Connor Grealy | Dan Kramer |

That is just the starting point — change it every day if you like.

**To move someone:** tap their name, then tap whoever you want them to swap
with. They exchange places. Because it swaps rather than moves, the groups
always stay at four each.

The screen tells you if something is wrong — someone in both groups, someone in
neither, a group of three or five, or a group that is not two-and-two. None of
that stops you saving; it asks you to confirm, in case you meant it.

---

## Who is playing whom

**Open the day → tap Edit matchups.**

This is separate from the 4-balls, and just as open. Tap a player, then tap
another from the **same team**, and they swap places in the matches. The 4-balls
do not move.

*Example — Day 4 singles.* A 4-ball of Connor, Nick, Jason and Ryan can be
played as Connor v Jason and Nick v Ryan, or as Connor v Ryan and Nick v Jason.
Tap Jason, tap Ryan, save. The four of you still walk round together.

### Day 3 — three separate sections

Day 3 is three six-hole games off one card:

| Holes | Format |
| --- | --- |
| 1–6 | **Two-man Scramble** — both hit, take the better shot, both play again from there |
| 7–12 | **Shamble** — both tee off, take the better drive, then each plays their own ball in; the lower net counts |
| 13–18 | **Better Ball** — both play their own ball throughout; the lower net counts |

Each section has its **own Edit matchups button** on the round screen, and its
own Save. So the same four of you can walk all 18 holes together while your
partners and opponents change at the 7th and again at the 13th. Re-pairing holes
7–12 leaves 1–6 and 13–18 exactly as they were.

---

## Getting everyone on it

Send them the Vercel link. Tell them to:

1. Open the link in **Safari** (iPhone) or **Chrome** (Android).
2. Tap their own name.
3. Tap the **Share** button, then **Add to Home Screen**.

It then behaves like a normal app — full screen, its own icon, no browser bar.

There is no PIN to hand out. Keep the **link** private instead — anyone who has
it can open the app and change anything in it.

---

## On the course

- Tap **Start scoring** on the day's round. It opens that course's scorecard
  already loaded — you never pick a course.
- If a day is set up with more than one format, the card **switches by itself**
  as you walk. Day 3 ships as singles over 1–6, a two-man scramble over 7–12 and
  alternate shot over 13–18 — but that is just how it is configured, and
  Admin → Formats & pairings can change it right up to the tee.
- Anyone can enter scores. Tap the big number your ball took. That is the whole
  interaction — there is no Save button.
- The **✕** button means picked up / conceded the hole.
- When both sides have scored a hole, the app moves to the next hole by itself.
- **No signal?** Keep scoring. The badge turns to **OFFLINE** and your scores
  queue up on your phone. They send themselves the moment signal returns, even
  if you close the app in between.
- If two people type different scores for the same hole, the second one is
  stopped and told, rather than silently overwriting.
- Wrong score? A captain can fix any hole at any time from that match's
  scorecard.

---

## About HNA (Handicaps Network Africa)

The app has a slot for each player's HNA member number and can pull handicaps
automatically **if** HNA grants official API access.

At the moment it does not do this, because there is no public HNA API to build
against and no credentials were supplied. Rather than guess at how their system
works or scrape their website — both of which would break without warning and
could produce wrong handicaps — the app uses handicaps typed in by hand.

**Nothing is lost by this.** Every calculation, screen and scorecard works
identically. The only difference is that a human types eight numbers once.

If HNA does grant access later, a developer sets `HNA_API_BASE_URL` and
`HNA_API_KEY` and adjusts one function
(`fetchHandicapIndex` in `src/lib/hna/adapter.ts`) to match their documentation.
The "Refresh handicaps from HNA" button in **Admin → Players** then works, and
the app labels each handicap as HNA-synced or manually entered.

---

## Troubleshooting

**"No tour found in the database."**
`seed.sql` was not run, or was run before `0001_init.sql`. Run them in that
order in the Supabase SQL editor.

**Still shows the gold DEMO badge after deploying.**
The Supabase environment variables did not reach the build. In Vercel, check
Settings → Environment Variables, then **Redeploy** — environment variables only
take effect on a new deployment.

**Scores are not appearing on other phones.**
In Supabase, go to **Database → Replication** (or **Realtime**) and confirm the
`scores` table is published. The migration tries to do this automatically but
some projects need Realtime enabled in the dashboard first.

**It is asking me for a PIN.**
It should not — PINs were removed. You are looking at an old deployment. Push
the latest code, or in Vercel open the newest deployment and **Redeploy**. You
can also delete the old `TOUR_PIN` and `ADMIN_PIN` variables; they are ignored.

**A player's strokes look wrong.**
Check three things in order: their Handicap Index (Admin → Players), the tee
selected for that round (Admin → Rounds), and whether the course has been
verified (Admin → Courses). The round screen has a **Strokes received** table
showing every player's course handicap and exactly which holes they get a shot
on; the match screen shows the shots each side gets after the format allowance.

**"Reading photos automatically needs an ANTHROPIC_API_KEY".**
That feature is optional. Either add the key in Vercel (get one at
console.anthropic.com) and redeploy, or just type the scorecard in by hand —
the result is identical.

---

## For a developer

```bash
npm install
cp .env.example .env.local   # fill in, or leave blank for demo mode
npm run dev

npm test          # 139 tests: scoring, points, formats, 4-balls, matchups
npm run typecheck
npm run lint
npm run seed:sql  # regenerate supabase/seed.sql after editing src/lib/seed/
```

Re-running `seed.sql` is safe and idempotent: it updates the seeded rows in
place and never touches the `scores` table.
