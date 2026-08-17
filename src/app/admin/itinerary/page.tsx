'use client';

import { useState } from 'react';
import { useTour } from '@/lib/data/provider';
import { AdminShell } from '@/components/admin/AdminShell';
import { Accordion, SelectField, TextField } from '@/components/admin/fields';
import { SectionTitle } from '@/components/ui';
import { formatDate } from '@/lib/format';
import type { ItineraryCategory } from '@/lib/types';

const CATEGORIES: Array<{ value: ItineraryCategory; label: string }> = [
  { value: 'golf', label: '⛳ Golf' },
  { value: 'travel', label: '✈️ Travel' },
  { value: 'meal', label: '🍽️ Food' },
  { value: 'social', label: '🍺 Social' },
  { value: 'ceremony', label: '🏆 Ceremony' },
  { value: 'sport', label: '🏉 Other sport' },
  { value: 'rest', label: '😴 Rest' },
  { value: 'admin', label: '📋 Admin' },
];

/** Add, edit and remove itinerary entries. Every seeded entry is editable. */
export default function AdminItineraryPage() {
  const { snapshot, update, insert, remove, roundById } = useTour();
  const [newDate, setNewDate] = useState(snapshot.tour.startDate);
  const [busy, setBusy] = useState(false);

  const dates = [...new Set(snapshot.itinerary.map((i) => i.date))].sort();

  const addItem = async () => {
    setBusy(true);
    try {
      await insert('itinerary', {
        tourId: snapshot.tour.id,
        date: newDate,
        startTime: null,
        endTime: null,
        title: 'New entry',
        location: null,
        details: null,
        category: 'social',
        roundId: null,
        sortOrder: snapshot.itinerary.length,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Itinerary" subtitle="Everything on the schedule is editable">
      <div className="card space-y-2 px-3.5 py-3.5">
        <div className="label">Add an entry</div>
        <div className="flex gap-2">
          <input
            type="date"
            className="field flex-1"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
          />
          <button onClick={addItem} disabled={busy} className="btn-primary shrink-0">
            Add
          </button>
        </div>
      </div>

      {dates.map((date) => (
        <div key={date}>
          <SectionTitle>{formatDate(date)}</SectionTitle>
          <div className="space-y-2">
            {snapshot.itinerary
              .filter((item) => item.date === date)
              .sort((a, b) => (a.startTime ?? '99:99').localeCompare(b.startTime ?? '99:99'))
              .map((item) => {
                const round = item.roundId ? roundById(item.roundId) : undefined;
                return (
                  <Accordion
                    key={item.id}
                    title={item.title}
                    subtitle={`${item.startTime ?? 'no time'}${item.location ? ` · ${item.location}` : ''}`}
                    badge={
                      round ? (
                        <span className="chip bg-fairway-500/25 text-fairway-300">
                          DAY {round.dayNo}
                        </span>
                      ) : undefined
                    }
                  >
                    <TextField
                      label="Title"
                      value={item.title}
                      onSave={(value) => update('itinerary', item.id, { title: value })}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <TextField
                        label="Start"
                        value={item.startTime ?? ''}
                        type="time"
                        onSave={(value) =>
                          update('itinerary', item.id, { startTime: value || null })
                        }
                      />
                      <TextField
                        label="End"
                        value={item.endTime ?? ''}
                        type="time"
                        onSave={(value) => update('itinerary', item.id, { endTime: value || null })}
                      />
                    </div>
                    <TextField
                      label="Date"
                      value={item.date}
                      type="date"
                      onSave={(value) => update('itinerary', item.id, { date: value })}
                    />
                    <TextField
                      label="Location"
                      value={item.location ?? ''}
                      onSave={(value) => update('itinerary', item.id, { location: value || null })}
                    />
                    <TextField
                      label="Details"
                      value={item.details ?? ''}
                      onSave={(value) => update('itinerary', item.id, { details: value || null })}
                    />
                    <SelectField
                      label="Category"
                      value={item.category}
                      options={CATEGORIES}
                      onSave={(value) => update('itinerary', item.id, { category: value })}
                    />
                    <SelectField
                      label="Links to round"
                      value={item.roundId ?? ''}
                      options={[
                        { value: '', label: 'Not a golf round' },
                        ...snapshot.rounds.map((r) => ({
                          value: r.id,
                          label: `Day ${r.dayNo} — ${r.name}`,
                        })),
                      ]}
                      hint="Linked entries become tappable and open that day's live scorecards."
                      onSave={(value) =>
                        update('itinerary', item.id, { roundId: value || null })
                      }
                    />
                    <button
                      onClick={() => {
                        if (confirm(`Delete “${item.title}”?`)) void remove('itinerary', item.id);
                      }}
                      className="btn-danger w-full text-xs"
                    >
                      Delete this entry
                    </button>
                  </Accordion>
                );
              })}
          </div>
        </div>
      ))}
    </AdminShell>
  );
}
