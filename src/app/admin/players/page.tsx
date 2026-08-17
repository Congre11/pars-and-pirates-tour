'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, NumberField, TextField } from '@/components/admin/fields';
import { Avatar, SectionTitle, Warning } from '@/components/ui';
import { courseHandicapLabel, handicapLabel, relativeTime } from '@/lib/format';
import { courseHandicap } from '@/lib/scoring/handicap';

/**
 * Players, handicap indexes and HNA member numbers.
 *
 * The handicap index is the single most important number to get right before
 * the tour, so it is the first field on every card and the screen warns loudly
 * while any are missing.
 */
export default function AdminPlayersPage() {
  const { snapshot, update, teamById, teesForCourse, courseById } = useTour();
  const [hnaResult, setHnaResult] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const missing = snapshot.players.filter((p) => p.handicapIndex === null);

  const refreshHandicaps = async () => {
    setRefreshing(true);
    setHnaResult(null);
    try {
      const response = await fetch('/api/handicaps/refresh', { method: 'POST' });
      const body = await response.json();
      if (!response.ok) {
        setHnaResult(body.error ?? 'HNA refresh is not available.');
        return;
      }
      setHnaResult(
        `Updated ${body.updated.length} of ${body.checked}.` +
          (body.failed.length ? ` Failed: ${body.failed.map((f: { name: string }) => f.name).join(', ')}.` : ''),
      );
    } catch {
      setHnaResult('Could not reach the server.');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <AdminShell title="Players" subtitle="Handicaps, nicknames and HNA numbers">
      {missing.length > 0 && (
        <Warning>
          {missing.length} player{missing.length === 1 ? '' : 's'} still need a handicap index:{' '}
          {missing.map((p) => p.name.split(' ')[0]).join(', ')}. They are scored off scratch until
          you enter one.
        </Warning>
      )}

      {[...snapshot.teams]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((team) => (
          <div key={team.id}>
            <SectionTitle>
              <span style={{ color: team.accent }}>
                {team.crest} {team.name}
              </span>
            </SectionTitle>
            <div className="space-y-2">
              {snapshot.players
                .filter((p) => p.teamId === team.id)
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((player) => (
                  <Accordion
                    key={player.id}
                    title={player.name}
                    subtitle={
                      <>
                        HI {handicapLabel(player.handicapIndex)}
                        {player.handicapUpdatedAt &&
                          ` · ${player.handicapSource === 'hna' ? 'HNA' : 'manual'} ${relativeTime(player.handicapUpdatedAt)}`}
                      </>
                    }
                    badge={
                      player.handicapIndex === null ? (
                        <span className="chip bg-brass-500/25 text-brass-300">SET HI</span>
                      ) : (
                        <Avatar
                          name={player.name}
                          initials={player.initials}
                          colour={team.colour}
                          photoUrl={player.photoUrl}
                          size={26}
                        />
                      )
                    }
                  >
                    <NumberField
                      label="Handicap index"
                      value={player.handicapIndex}
                      step={0.1}
                      min={-10}
                      max={54}
                      allowEmpty
                      hint="From HNA or their home club. Use a negative number for a plus handicap (e.g. -1.4 for +1.4). Leave blank if unknown."
                      onSave={(value) =>
                        update('players', player.id, {
                          handicapIndex: value,
                          handicapSource: 'manual',
                          handicapUpdatedAt: new Date().toISOString(),
                        })
                      }
                    />

                    {/* What that index actually plays off, on each course. */}
                    {player.handicapIndex !== null && (
                      <div className="rounded-xl bg-black/30 px-3 py-2.5">
                        <div className="label mb-1.5">Course handicap</div>
                        <div className="space-y-1 text-xs">
                          {snapshot.rounds.map((round) => {
                            const tee = teesForCourse(round.courseId).find(
                              (t) => t.id === round.teeId,
                            );
                            const course = courseById(round.courseId);
                            if (!tee || !course) return null;
                            return (
                              <div key={round.id} className="flex justify-between">
                                <span className="truncate text-chalk-400">
                                  {course.name} ({tee.name})
                                </span>
                                <span className="tabular font-bold">
                                  {courseHandicapLabel(
                                    courseHandicap(player.handicapIndex as number, tee),
                                  )}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <TextField
                      label="HNA member number"
                      value={player.hnaId ?? ''}
                      placeholder="Not set"
                      hint="Only needed if you connect official HNA access. Handicaps work fine without it."
                      onSave={(value) => update('players', player.id, { hnaId: value || null })}
                    />
                    <TextField
                      label="Nickname"
                      value={player.nickname ?? ''}
                      placeholder="Optional"
                      onSave={(value) => update('players', player.id, { nickname: value || null })}
                    />
                    <TextField
                      label="Photo URL"
                      value={player.photoUrl ?? ''}
                      placeholder="https://…"
                      type="url"
                      inputMode="url"
                      hint="Any public image link. Leave blank to use initials."
                      onSave={(value) => update('players', player.id, { photoUrl: value || null })}
                    />
                    <TextField
                      label="Name"
                      value={player.name}
                      onSave={(value) =>
                        update('players', player.id, {
                          name: value,
                          initials: value
                            .split(/\s+/)
                            .map((part) => part[0] ?? '')
                            .join('')
                            .slice(0, 2)
                            .toUpperCase(),
                        })
                      }
                    />
                  </Accordion>
                ))}
            </div>
          </div>
        ))}

      <SectionTitle>HNA sync</SectionTitle>
      <div className="card space-y-3 px-4 py-3.5">
        <p className="text-sm leading-snug text-chalk-300">
          If official HNA API access has been granted and the credentials are configured on the
          server, this pulls each player’s current handicap index. Without it, the manual indexes
          above are used and nothing else changes.
        </p>
        <button onClick={refreshHandicaps} disabled={refreshing} className="btn-ghost w-full">
          {refreshing ? 'Checking…' : 'Refresh handicaps from HNA'}
        </button>
        {hnaResult && (
          <p className="rounded-lg bg-black/30 px-3 py-2 text-xs text-chalk-300">{hnaResult}</p>
        )}
      </div>
    </AdminShell>
  );
}
