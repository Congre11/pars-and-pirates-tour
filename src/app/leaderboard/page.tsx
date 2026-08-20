'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { Scoreboard } from '@/components/Scoreboard';
import { MatchTile } from '@/components/MatchTile';
import { EmptyState, PageHeader, SectionTitle } from '@/components/ui';
import { currentRound } from '@/lib/tour-helpers';
import { formatShortDate, points as fmtPoints, todayIso } from '@/lib/format';

/**
 * Live Leaderboard.
 *
 * Overall points at the top, then every match grouped by day. Live matches are
 * pulled to the front because those are the ones people are refreshing for.
 */
export default function LeaderboardPage() {
  const { snapshot, outcomes, matchesForRound, standingsForRound, standings } = useTour();

  const rounds = useMemo(
    () => [...snapshot.rounds].sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot.rounds],
  );
  const active = useMemo(() => currentRound(snapshot, outcomes), [snapshot, outcomes]);
  const [filter, setFilter] = useState<'all' | 'live'>('all');

  const liveMatches = snapshot.matches.filter((m) => {
    const outcome = outcomes.get(m.id);
    return outcome && outcome.holesPlayed > 0 && !outcome.isComplete;
  });

  const isFinalDay = active?.dayNo === 4;

  return (
    <div className="space-y-4 pb-6">
      <PageHeader
        title="Leaderboard"
        subtitle={
          snapshot.tour.status === 'complete' || standings.pointsRemaining === 0
            ? 'Final standings'
            : `${fmtPoints(standings.pointsRemaining)} points still to play for`
        }
      />

      <Scoreboard projected={isFinalDay || liveMatches.length > 0} />

      <div className="flex gap-2">
        <FilterButton value="all" current={filter} onClick={setFilter}>
          All matches
        </FilterButton>
        <FilterButton value="live" current={filter} onClick={setFilter}>
          Live now {liveMatches.length > 0 && `(${liveMatches.length})`}
        </FilterButton>
      </div>

      {filter === 'live' && (
        <div className="space-y-2">
          {liveMatches.length === 0 ? (
            <EmptyState
              title="Nothing in play right now"
              detail="Matches appear here as soon as the first hole is scored."
            />
          ) : (
            liveMatches.map((match) => <MatchTile key={match.id} matchId={match.id} />)
          )}
        </div>
      )}

      {filter === 'all' &&
        rounds.map((round) => {
          const matches = matchesForRound(round.id);
          if (matches.length === 0) return null;
          const roundStandings = standingsForRound(round.id);
          const [home, away] = snapshot.teams;
          const complete = matches.every((m) => outcomes.get(m.id)?.isComplete);

          return (
            <div key={round.id}>
              <SectionTitle
                action={
                  <Link
                    href={`/round/${round.id}`}
                    className="text-xs font-semibold text-fairway-300"
                  >
                    Details
                  </Link>
                }
              >
                <span className="flex items-center gap-2">
                  Day {round.dayNo} · {formatShortDate(round.date)}
                  {complete && <span className="chip bg-white/10 text-chalk-400">DONE</span>}
                  {active?.id === round.id && !complete && (
                    <span className="chip bg-fairway-500/20 text-fairway-300">
                      {round.date === todayIso() ? 'TODAY' : 'IN PLAY'}
                    </span>
                  )}
                </span>
              </SectionTitle>

              {/* Day sub-total, so you can see who won each day. */}
              {home && away && (
                <div className="mb-2 flex items-center justify-center gap-3 rounded-xl bg-black/25 px-3 py-1.5 text-sm">
                  <span className="tabular font-bold" style={{ color: home.accent }}>
                    {fmtPoints(roundStandings.byTeam[home.id]?.points ?? 0)}
                  </span>
                  <span className="text-[0.65rem] uppercase tracking-wider text-chalk-500">
                    {round.formatLabel.length > 34
                      ? `${round.formatLabel.slice(0, 32)}…`
                      : round.formatLabel}
                  </span>
                  <span className="tabular font-bold" style={{ color: away.accent }}>
                    {fmtPoints(roundStandings.byTeam[away.id]?.points ?? 0)}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                {matches.map((match) => (
                  <MatchTile key={match.id} matchId={match.id} />
                ))}
              </div>
            </div>
          );
        })}

      <p className="pt-2 text-center text-xs leading-snug text-chalk-500">
        Match points: {fmtPoints(snapshot.tour.settings.pointsPerWin)} for a win,{' '}
        {fmtPoints(snapshot.tour.settings.pointsPerHalf)} each for a half — except on Day 3, where a
        halved match awards nothing and the half point is burned.{' '}
        <Link href="/formats" className="text-fairway-300">
          Formats &amp; rules
        </Link>
      </p>
    </div>
  );
}

function FilterButton({
  value,
  current,
  onClick,
  children,
}: {
  value: 'all' | 'live';
  current: 'all' | 'live';
  onClick: (value: 'all' | 'live') => void;
  children: React.ReactNode;
}) {
  const active = value === current;
  return (
    <button
      onClick={() => onClick(value)}
      className={`tap flex-1 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
        active ? 'bg-fairway-500 text-white' : 'bg-white/6 text-chalk-300'
      }`}
    >
      {children}
    </button>
  );
}
