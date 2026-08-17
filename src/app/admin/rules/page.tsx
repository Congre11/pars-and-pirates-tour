'use client';

import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { NumberField, SelectField, ToggleField } from '@/components/admin/fields';
import { SectionTitle } from '@/components/ui';
import { FORMAT_LABELS, type MatchFormat, type TourSettings } from '@/lib/types';

const ALLOWANCE_HELP: Record<MatchFormat, string> = {
  team_scramble:
    'Applied to the four course handicaps sorted lowest to highest. The common setting is 20 / 15 / 10 / 5%.',
  better_ball: 'Applied to each player individually. WHS four-ball match play is 90%.',
  singles: 'Applied to each player individually. WHS singles match play is 100%.',
  two_man_scramble:
    'Applied to the two course handicaps, lowest first. The common setting is 35 / 15%.',
  foursomes: 'Applied to both course handicaps. WHS foursomes is 50% of the combined total.',
};

/**
 * Points and handicap rules.
 *
 * The spec leaves the exact allowances as a pre-tour decision, so all of them
 * are editable here. Changes recalculate every scorecard instantly, which
 * makes it easy to see what a proposed change actually does before agreeing it.
 */
export default function AdminRulesPage() {
  const { snapshot, update } = useTour();
  const settings = snapshot.tour.settings;

  const patch = (changes: Partial<TourSettings>) =>
    update('tour', snapshot.tour.id, { settings: { ...settings, ...changes } });

  const patchAllowance = (format: MatchFormat, weights: number[]) =>
    patch({
      allowances: {
        ...settings.allowances,
        [format]: { ...settings.allowances[format], weights },
      },
    });

  return (
    <AdminShell title="Rules" subtitle="Points and handicap allowances">
      <SectionTitle>Points</SectionTitle>
      <div className="card space-y-3 px-3.5 py-3.5">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Win"
            value={settings.pointsPerWin}
            step={0.5}
            min={0}
            onSave={(value) => patch({ pointsPerWin: value ?? 1 })}
          />
          <NumberField
            label="Half (each)"
            value={settings.pointsPerHalf}
            step={0.5}
            min={0}
            onSave={(value) => patch({ pointsPerHalf: value ?? 0.5 })}
          />
        </div>
        <p className="text-xs leading-snug text-chalk-500">
          These are the defaults for new matches and the ratio used when a match is halved.
          Individual matches can be worth more or less — set that per match in Admin → Formats
          &amp; pairings.
        </p>
      </div>

      <SectionTitle>Handicapping</SectionTitle>
      <div className="card space-y-3 px-3.5 py-3.5">
        <ToggleField
          label="Use handicaps"
          value={settings.handicapsEnabled}
          hint="Turn off to play everything off scratch. Every net score becomes the gross score."
          onSave={(value) => patch({ handicapsEnabled: value })}
        />
        <div className="border-t border-white/6 pt-3">
          <SelectField
            label="Match play style"
            value={settings.handicapMode}
            options={[
              { value: 'difference', label: 'Difference — lowest plays off scratch (standard)' },
              { value: 'full', label: 'Full allowance for both sides' },
            ]}
            hint="Difference is how match play is normally played and is what most people expect."
            onSave={(value) => patch({ handicapMode: value })}
          />
        </div>
        <div className="border-t border-white/6 pt-3">
          <ToggleField
            label="Lock completed holes"
            value={settings.lockCompletedHoles}
            hint="Once the match has moved past a hole, only captains can change it. Stops accidental taps rewriting history."
            onSave={(value) => patch({ lockCompletedHoles: value })}
          />
        </div>
      </div>

      <SectionTitle>Allowances by format</SectionTitle>
      <div className="space-y-2">
        {(Object.keys(FORMAT_LABELS) as MatchFormat[]).map((format) => {
          const allowance = settings.allowances[format];
          return (
            <div key={format} className="card px-3.5 py-3.5">
              <h3 className="text-sm font-bold">{FORMAT_LABELS[format]}</h3>
              <p className="mt-1 mb-2.5 text-xs leading-snug text-chalk-500">
                {ALLOWANCE_HELP[format]}
              </p>
              <div className={`grid gap-2 ${allowance.weights.length > 2 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                {allowance.weights.map((weight, index) => (
                  <NumberField
                    key={index}
                    label={
                      allowance.weights.length === 1
                        ? 'Percent'
                        : index === 0
                          ? 'Lowest %'
                          : index === allowance.weights.length - 1
                            ? 'Highest %'
                            : `#${index + 1} %`
                    }
                    value={Math.round(weight * 100)}
                    min={0}
                    max={200}
                    onSave={(value) => {
                      const next = [...allowance.weights];
                      next[index] = (value ?? 0) / 100;
                      return patchAllowance(format, next);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <p className="pb-2 text-center text-xs text-chalk-500">
        Course handicap = Index × (Slope ÷ 113) + (Course Rating − Par), then the allowance above,
        then the match-play difference.
      </p>
    </AdminShell>
  );
}
