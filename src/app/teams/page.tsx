'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTour } from '@/lib/data/provider';
import { Avatar, PageHeader, SectionTitle, StatTile } from '@/components/ui';
import { handicapLabel, points as fmtPoints, relativeTime } from '@/lib/format';

/**
 * Teams, rosters, handicaps and each player's contribution.
 *
 * The per-player record is derived from the same engine that drives the
 * scorecards, so it can never disagree with the leaderboard.
 */
export default function TeamsPage() {
  const { snapshot, outcomes, standings, sidesForMatch, playerById } = useTour();

  /** Points, wins and holes won per player, derived from completed matches. */
  const playerStats = useMemo(() => {
    const stats = new Map<
      string,
      { points: number; played: number; won: number; halved: number; lost: number; holesWon: number }
    >();
    const ensure = (id: string) => {
      if (!stats.has(id)) {
        stats.set(id, { points: 0, played: 0, won: 0, halved: 0, lost: 0, holesWon: 0 });
      }
      return stats.get(id)!;
    };

    for (const [matchId, outcome] of outcomes) {
      const sides = sidesForMatch(matchId);
      for (const side of sides) {
        for (const playerId of side.playerIds) {
          const record = ensure(playerId);
          record.holesWon += outcome.holesWon[side.id] ?? 0;
          if (!outcome.isComplete) continue;
          record.played += 1;
          record.points += outcome.points[side.id] ?? 0;
          if (outcome.winnerSideId === null) record.halved += 1;
          else if (outcome.winnerSideId === side.id) record.won += 1;
          else record.lost += 1;
        }
      }
    }
    return stats;
  }, [outcomes, sidesForMatch]);

  const mvp = useMemo(() => {
    let best: { playerId: string; points: number } | null = null;
    for (const [playerId, stat] of playerStats) {
      if (stat.points > 0 && (!best || stat.points > best.points)) {
        best = { playerId, points: stat.points };
      }
    }
    return best;
  }, [playerStats]);

  return (
    <div className="space-y-4 pb-6">
      <PageHeader title="Teams" subtitle="Rosters, handicaps and points contributed" />

      {mvp && (
        <div className="card-raised flex items-center gap-3 px-4 py-3">
          <span className="text-2xl">🏅</span>
          <div className="min-w-0 flex-1">
            <div className="label">Leading points scorer</div>
            <div className="truncate font-bold">{playerById(mvp.playerId)?.name}</div>
          </div>
          <div className="tabular display text-2xl font-bold text-brass-400">
            {fmtPoints(mvp.points)}
          </div>
        </div>
      )}

      {[...snapshot.teams]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((team) => {
          const roster = snapshot.players
            .filter((p) => p.teamId === team.id)
            .sort((a, b) => Number(b.isCaptain) - Number(a.isCaptain) || a.sortOrder - b.sortOrder);
          const stat = standings.byTeam[team.id];

          return (
            <div key={team.id} className="card overflow-hidden">
              <div
                className="flex items-center gap-3 px-4 py-3"
                style={{ background: `linear-gradient(90deg, ${team.colour}, ${team.colour}22)` }}
              >
                <span className="text-2xl">{team.crest}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="display truncate text-lg font-bold text-white">{team.name}</h2>
                  <p className="text-xs text-white/70">
                    {stat ? `${stat.matchesWon}W · ${stat.matchesHalved}H · ${stat.matchesLost}L` : ''}
                  </p>
                </div>
                <div className="tabular display text-3xl font-bold text-white">
                  {fmtPoints(stat?.points ?? 0)}
                </div>
              </div>

              <div className="divide-y divide-white/6">
                {roster.map((player) => {
                  const record = playerStats.get(player.id);
                  return (
                    <div key={player.id} className="flex items-center gap-3 px-3.5 py-3">
                      <Avatar
                        name={player.name}
                        initials={player.initials}
                        colour={team.colour}
                        photoUrl={player.photoUrl}
                        size={38}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{player.name}</span>
                          {player.isCaptain && (
                            <span className="chip bg-brass-500/25 text-brass-300" title="Captain">
                              C
                            </span>
                          )}
                          {/* Separate from captaincy — the organiser runs the tour. */}
                          {player.isOrganiser && (
                            <span
                              className="chip bg-fairway-500/25 text-fairway-300"
                              title="Organiser"
                            >
                              ORG
                            </span>
                          )}
                        </div>
                        <div className="truncate text-xs text-chalk-500">
                          {player.nickname ? `“${player.nickname}” · ` : ''}
                          HI {handicapLabel(player.handicapIndex)}
                          {player.handicapIndex === null && (
                            <span className="text-brass-400"> — not set</span>
                          )}
                          {player.handicapSource === 'hna' && player.handicapUpdatedAt && (
                            <span className="text-fairway-300">
                              {' '}
                              · HNA {relativeTime(player.handicapUpdatedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="tabular text-lg font-bold leading-none">
                          {fmtPoints(record?.points ?? 0)}
                        </div>
                        <div className="text-[0.6rem] uppercase tracking-wider text-chalk-500">
                          pts
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

      <SectionTitle>Tour stats</SectionTitle>
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="Matches done"
          value={[...outcomes.values()].filter((o) => o.isComplete).length}
        />
        <StatTile
          label="In play"
          value={
            [...outcomes.values()].filter((o) => o.holesPlayed > 0 && !o.isComplete).length
          }
        />
        <StatTile label="Points left" value={fmtPoints(standings.pointsRemaining)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Link href="/formats" className="card tap px-3 py-3 text-center text-sm font-semibold">
          📖 Formats
        </Link>
        <Link href="/admin/players" className="card tap px-3 py-3 text-center text-sm font-semibold">
          ✏️ Edit handicaps
        </Link>
      </div>
    </div>
  );
}
