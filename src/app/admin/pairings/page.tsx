'use client';

import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, NumberField, SelectField, TextField } from '@/components/admin/fields';
import { SectionTitle } from '@/components/ui';
import { FORMAT_LABELS, PLAYERS_PER_SIDE, type MatchFormat } from '@/lib/types';

/**
 * Pairings.
 *
 * The captains' screen: who plays whom, in what format, over which holes and
 * for how many points. Changes take effect immediately on every phone, so the
 * "captain announces the line-up" moment can be done live.
 */
export default function AdminPairingsPage() {
  const { snapshot, update, sidesForMatch, matchesForRound, playerById, teamById, outcomeFor } =
    useTour();

  const formatOptions = (Object.keys(FORMAT_LABELS) as MatchFormat[]).map((format) => ({
    value: format,
    label: FORMAT_LABELS[format],
  }));

  return (
    <AdminShell title="Pairings" subtitle="Who plays whom, and for how many points">
      <p className="card px-3.5 py-3 text-sm leading-snug text-chalk-300">
        Tap a match to change the line-up. A player can only be picked once per match. Changing a
        pairing does not delete any scores already entered against that side.
      </p>

      {[...snapshot.rounds]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((round) => {
          const matches = matchesForRound(round.id);
          return (
            <div key={round.id}>
              <SectionTitle>
                Day {round.dayNo} · {round.formatLabel}
              </SectionTitle>
              <div className="space-y-2">
                {matches.map((match) => {
                  const sides = sidesForMatch(match.id);
                  const outcome = outcomeFor(match.id);
                  const started = (outcome?.holesPlayed ?? 0) > 0;

                  return (
                    <Accordion
                      key={match.id}
                      title={match.name}
                      subtitle={sides
                        .map((side) =>
                          side.playerIds
                            .map((id) => playerById(id)?.name.split(' ')[0] ?? '?')
                            .join(' & '),
                        )
                        .join('  v  ')}
                      badge={
                        started ? (
                          <span className="chip bg-fairway-500/25 text-fairway-300">IN PLAY</span>
                        ) : undefined
                      }
                    >
                      <TextField
                        label="Match name"
                        value={match.name}
                        onSave={(value) => update('matches', match.id, { name: value })}
                      />

                      <SelectField
                        label="Format"
                        value={match.format}
                        options={formatOptions}
                        hint={`${PLAYERS_PER_SIDE[match.format]} player(s) per side.`}
                        onSave={(value) => update('matches', match.id, { format: value })}
                      />

                      <div className="grid grid-cols-3 gap-2">
                        <NumberField
                          label="First hole"
                          value={match.startHole}
                          min={1}
                          max={18}
                          onSave={(value) =>
                            update('matches', match.id, { startHole: value ?? 1 })
                          }
                        />
                        <NumberField
                          label="Last hole"
                          value={match.endHole}
                          min={1}
                          max={18}
                          onSave={(value) => update('matches', match.id, { endHole: value ?? 18 })}
                        />
                        <NumberField
                          label="Points"
                          value={match.pointsValue}
                          step={0.5}
                          min={0}
                          onSave={(value) =>
                            update('matches', match.id, { pointsValue: value ?? 1 })
                          }
                        />
                      </div>

                      {sides.map((side) => {
                        const team = teamById(side.teamId);
                        const teamPlayers = snapshot.players.filter(
                          (p) => p.teamId === side.teamId,
                        );
                        const wanted = PLAYERS_PER_SIDE[match.format];

                        return (
                          <div key={side.id}>
                            <div className="label mb-1.5 flex items-center justify-between">
                              <span style={{ color: team?.accent }}>{team?.name}</span>
                              <span
                                className={
                                  side.playerIds.length === wanted ? '' : 'text-brass-400'
                                }
                              >
                                {side.playerIds.length}/{wanted}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              {teamPlayers.map((player) => {
                                const picked = side.playerIds.includes(player.id);
                                return (
                                  <button
                                    key={player.id}
                                    onClick={() => {
                                      const next = picked
                                        ? side.playerIds.filter((id) => id !== player.id)
                                        : [...side.playerIds, player.id];
                                      void update('sides', side.id, { playerIds: next });
                                    }}
                                    className={`tap rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${
                                      picked ? 'text-white' : 'bg-white/6 text-chalk-300'
                                    }`}
                                    style={picked ? { backgroundColor: team?.colour } : undefined}
                                  >
                                    {player.name}
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2">
                              <NumberField
                                label="Playing handicap override"
                                value={side.handicapOverride}
                                allowEmpty
                                hint="Leave blank to let the app work it out from the players' indexes and the format allowance."
                                onSave={(value) =>
                                  update('sides', side.id, { handicapOverride: value })
                                }
                              />
                            </div>
                          </div>
                        );
                      })}
                    </Accordion>
                  );
                })}
              </div>
            </div>
          );
        })}
    </AdminShell>
  );
}
