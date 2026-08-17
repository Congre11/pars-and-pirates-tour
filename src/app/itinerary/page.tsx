'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTour } from '@/lib/data/provider';
import { PageHeader } from '@/components/ui';
import { countdownLabel, formatDate, todayIso } from '@/lib/format';
import type { ItineraryCategory, ItineraryItem } from '@/lib/types';

const CATEGORY_ICON: Record<ItineraryCategory, string> = {
  golf: '⛳',
  travel: '✈️',
  meal: '🍽️',
  social: '🍺',
  ceremony: '🏆',
  sport: '🏉',
  rest: '😴',
  admin: '📋',
};

const CATEGORY_COLOUR: Record<ItineraryCategory, string> = {
  golf: 'var(--color-fairway-400)',
  travel: '#5b8dd6',
  meal: 'var(--color-brass-400)',
  social: '#c77dd6',
  ceremony: 'var(--color-brass-400)',
  sport: 'var(--color-pirate-300)',
  rest: 'var(--color-chalk-500)',
  admin: 'var(--color-chalk-500)',
};

/**
 * The full tour timeline: golf, travel, meals, ceremonies and the rugby.
 * Golf days link straight into that day's round and live scorecards.
 */
export default function ItineraryPage() {
  const { snapshot, roundById, courseById } = useTour();
  const today = todayIso();

  const byDate = useMemo(() => {
    const map = new Map<string, ItineraryItem[]>();
    for (const item of [...snapshot.itinerary].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const at = a.startTime ?? '99:99';
      const bt = b.startTime ?? '99:99';
      if (at !== bt) return at.localeCompare(bt);
      return a.sortOrder - b.sortOrder;
    })) {
      map.set(item.date, [...(map.get(item.date) ?? []), item]);
    }
    return map;
  }, [snapshot.itinerary]);

  return (
    <div className="space-y-5 pb-6">
      <PageHeader
        title="Itinerary"
        subtitle={`${snapshot.tour.location} · ${formatDate(snapshot.tour.startDate)} – ${formatDate(snapshot.tour.endDate)}`}
      />

      {byDate.size === 0 && (
        <p className="text-center text-sm text-chalk-500">Nothing scheduled yet.</p>
      )}

      {[...byDate.entries()].map(([date, items]) => {
        const isToday = date === today;
        const golfItem = items.find((i) => i.roundId);
        const round = golfItem?.roundId ? roundById(golfItem.roundId) : undefined;

        return (
          <section key={date}>
            <div
              className={`sticky top-[3.25rem] z-30 -mx-4 mb-2 flex items-baseline justify-between gap-2 px-4 py-2 backdrop-blur-md ${
                isToday ? 'bg-fairway-500/20' : 'bg-ink-950/85'
              }`}
            >
              <h2 className="display text-lg font-bold">
                {formatDate(date)}
                {round && (
                  <span className="ml-2 text-sm font-semibold text-fairway-300">
                    Day {round.dayNo}
                  </span>
                )}
              </h2>
              <span className="text-xs font-semibold text-chalk-500">
                {isToday ? 'TODAY' : countdownLabel(date)}
              </span>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                const linkedRound = item.roundId ? roundById(item.roundId) : undefined;
                const course = linkedRound ? courseById(linkedRound.courseId) : undefined;

                const body = (
                  <div
                    className={`card flex gap-3 px-3.5 py-3 ${
                      linkedRound ? 'border-fairway-400/30' : ''
                    }`}
                  >
                    <div className="flex w-12 shrink-0 flex-col items-center">
                      <span className="tabular text-sm font-bold text-brass-400">
                        {item.startTime ?? '—'}
                      </span>
                      {item.endTime && (
                        <span className="tabular text-[0.6rem] text-chalk-500">{item.endTime}</span>
                      )}
                      <span
                        className="mt-1.5 h-full w-0.5 rounded-full"
                        style={{ backgroundColor: CATEGORY_COLOUR[item.category], opacity: 0.4 }}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className="text-base leading-tight">
                          {CATEGORY_ICON[item.category]}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold leading-snug">{item.title}</span>
                          {item.location && (
                            <span className="block text-xs text-chalk-500">{item.location}</span>
                          )}
                        </span>
                      </div>
                      {item.details && (
                        <p className="mt-1.5 text-sm leading-snug text-chalk-300">{item.details}</p>
                      )}
                      {linkedRound && course && (
                        <p className="mt-2 text-sm font-semibold text-fairway-300">
                          Open {course.name} scorecards →
                        </p>
                      )}
                    </div>
                  </div>
                );

                return linkedRound ? (
                  <Link key={item.id} href={`/round/${linkedRound.id}`} className="tap block">
                    {body}
                  </Link>
                ) : (
                  <div key={item.id}>{body}</div>
                );
              })}
            </div>
          </section>
        );
      })}

      <p className="pt-2 text-center text-xs text-chalk-500">
        Anything wrong or missing? Captains can edit every entry in{' '}
        <Link href="/admin/itinerary" className="text-fairway-300">
          Admin → Itinerary
        </Link>
        .
      </p>
    </div>
  );
}
