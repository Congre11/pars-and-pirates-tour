/** Small display helpers shared across screens. */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parse an ISO date (YYYY-MM-DD) without timezone drift.
 * `new Date('2026-08-29')` is UTC midnight, which is the day before in some
 * timezones — not something you want on an itinerary.
 */
export function parseDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

export function formatDate(iso: string): string {
  if (!iso) return '';
  const date = parseDate(iso);
  return `${DAY_NAMES[date.getDay()]} ${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

export function formatShortDate(iso: string): string {
  if (!iso) return '';
  const date = parseDate(iso);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]}`;
}

/** Today's date as YYYY-MM-DD in the device's own timezone. */
export function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

export function daysUntil(iso: string): number {
  const target = parseDate(iso).getTime();
  const today = parseDate(todayIso()).getTime();
  return Math.round((target - today) / 86_400_000);
}

export function countdownLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1) return `In ${days} days`;
  if (days === -1) return 'Yesterday';
  return `${Math.abs(days)} days ago`;
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  if (seconds < 5400) return `${Math.round(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h ago`;
  return `${Math.round(seconds / 86_400)}d ago`;
}

/** "1", "0.5", "2.5" — never "0.50" or "1.0". */
export function points(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Math.round(value * 10) / 10);
}

export function handicapLabel(index: number | null): string {
  if (index === null) return '—';
  if (index < 0) return `+${Math.abs(index).toFixed(1)}`;
  return index.toFixed(1);
}

export function courseHandicapLabel(value: number): string {
  if (value < 0) return `+${Math.abs(value)}`;
  return String(value);
}
