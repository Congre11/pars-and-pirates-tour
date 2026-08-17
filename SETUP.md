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
4. Click **New query** again.
5. Open `supabase/seed.sql`, copy everything, paste, and click **Run**.
   This one prints a small table at the bottom. Check it says:

   ```
   teams 2 · players 8 · courses 4 · holes 72 · rounds 4 · matches 15 · itinerary 31
   ```

   That is your whole tour loaded: both teams, all eight players, four golf
   days, four courses with 18 holes each, and the full eight-day itinerary.

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
3. Before clicking Deploy, open **Environment Variables** and add these seven.
   Copy the names exactly.

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_SUPABASE_URL` | the Project URL from Step 3 |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon / public key |
   | `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
   | `TOUR_PIN` | any number you like, e.g. `1927` — everyone types this |
   | `ADMIN_PIN` | a *different* number, e.g. `2609` — captains only |
   | `SESSION_SECRET` | a long random string (see below) |
   | `NEXT_PUBLIC_APP_NAME` | `Pars & Pirates Tour` (optional) |

   For `SESSION_SECRET`, mash the keyboard for 40+ characters, or use a password
   generator. It does not need to be memorable — you never type it again.

4. Click **Deploy**. After a couple of minutes Vercel gives you a link like
   `https://pars-and-pirates-tour.vercel.app`.

### Step 5 — Check it worked (1 minute)

1. Open your new link. Type the `TOUR_PIN` and pick your name.
2. Tap **More → Setup checklist**.
3. Every line under "Connections" should have a green tick, and the gold
   **DEMO** badge should now say **LIVE**.

If something is red, that line tells you exactly which value is missing.

---

## Before the tour — the four things that matter

Open **More → Admin** using the **admin PIN** (not the tour PIN).

### 1. Handicap indexes — most important

**Admin → Players.** Tap each player and type their Handicap Index. Until you do
this, everyone is scored off scratch and the app warns you on every screen.

Use a negative number for a plus handicap (type `-1.4` for a player off +1.4).

### 2. Course scorecards — second most important

**Admin → Courses.** Each of the four courses was seeded with a *made-up but
sensible* scorecard so the app works out of the box. **These are not the real
scorecards.**

For each course, take a photo of the real card at the pro shop (or find it on
the club's website) and type in the correct **par**, **stroke index** and
**yardage** for each hole, plus the **course rating** and **slope** for the tee
you are playing. It takes about two minutes per course.

The screen warns you if a stroke index is used twice or if the holes do not add
up to the tee's par, which are the two mistakes people actually make.

When you are happy, flick **Data verified** on. The warnings disappear across
the app.

### 3. Tees

**Admin → Rounds.** Pick which tees you are playing on each day. This changes
everyone's course handicap, so do it before Day 1.

### 4. Pairings

**Admin → Pairings.** The app ships with balanced default line-ups. Change them
whenever the captains decide — the change appears on everyone's phone within
seconds, so you can do the big reveal live.

---

## Getting everyone on it

Send them the Vercel link and the `TOUR_PIN`. Tell them to:

1. Open the link in **Safari** (iPhone) or **Chrome** (Android).
2. Type the PIN and tap their own name.
3. Tap the **Share** button, then **Add to Home Screen**.

It then behaves like a normal app — full screen, its own icon, no browser bar.

Do **not** give out the `ADMIN_PIN` except to the captains and the organiser.

---

## On the course

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

**"Admin PIN required."**
You are signed in with the tour PIN. Go to **More → Sign out**, then sign back
in typing the admin PIN instead.

**A player's strokes look wrong.**
Check three things in order: their Handicap Index (Admin → Players), the tee
selected for that round (Admin → Rounds), and the course's stroke index and
rating (Admin → Courses). The match screen shows exactly how many shots each
side is getting.

---

## For a developer

```bash
npm install
cp .env.example .env.local   # fill in, or leave blank for demo mode
npm run dev

npm test          # 38 scoring engine tests
npm run typecheck
npm run lint
npm run seed:sql  # regenerate supabase/seed.sql after editing src/lib/seed/
```

Re-running `seed.sql` is safe and idempotent: it updates the seeded rows in
place and never touches the `scores` table.
