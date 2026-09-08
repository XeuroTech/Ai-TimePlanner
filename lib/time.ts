/**
 * Single source of truth for time helpers.
 *
 * Every time value in the app is stored as **minutes from midnight**
 * (0 = 00:00, 1439 = 23:59). This module replaces the four duplicated
 * `formatTime` copies that used to live in add-class, daily-plan,
 * daily-routine and the onboarding wizard.
 */

export const MINUTES_PER_DAY = 1440;

/** Clamps any number into a valid minutes-from-midnight value. */
export function clampMinutes(min: number): number {
  if (!Number.isFinite(min)) return 0;
  return Math.min(MINUTES_PER_DAY - 1, Math.max(0, Math.round(min)));
}

/** Wraps a minutes value into [0, 1440). Useful for arithmetic across midnight. */
export function wrapMinutes(min: number): number {
  const m = Math.round(min) % MINUTES_PER_DAY;
  return m < 0 ? m + MINUTES_PER_DAY : m;
}

/** `9:05 AM` — the canonical user-facing format. */
export function formatTime(min: number): string {
  const t = clampMinutes(min);
  const h = Math.floor(t / 60);
  const m = t % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')} ${period}`;
}

/** `09:05` — 24-hour form, for compact grids and sorting. */
export function formatTime24(min: number): string {
  const t = clampMinutes(min);
  return `${Math.floor(t / 60).toString().padStart(2, '0')}:${(t % 60).toString().padStart(2, '0')}`;
}

/** Splits minutes into the pieces a 12-hour clock face needs. */
export function toClockParts(min: number): {
  hour24: number;
  hour12: number;
  minute: number;
  period: Period;
} {
  const t = clampMinutes(min);
  const hour24 = Math.floor(t / 60);
  return {
    hour24,
    hour12: hour24 % 12 || 12,
    minute: t % 60,
    period: hour24 < 12 ? 'AM' : 'PM',
  };
}

export type Period = 'AM' | 'PM';

/** Rebuilds minutes-from-midnight from 12-hour clock pieces. */
export function fromClockParts(hour12: number, minute: number, period: Period): number {
  const h12 = ((Math.round(hour12) - 1 + 12) % 12) + 1; // normalise into 1..12
  const base = h12 % 12; // 12 -> 0
  const hour24 = period === 'PM' ? base + 12 : base;
  return clampMinutes(hour24 * 60 + wrapTo60(minute));
}

function wrapTo60(minute: number): number {
  const m = Math.round(minute) % 60;
  return m < 0 ? m + 60 : m;
}

/** Duration label such as `1h 30m`, used for class length summaries. */
export function formatDuration(startMin: number, endMin: number): string {
  const total = Math.max(0, clampMinutes(endMin) - clampMinutes(startMin));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Local `YYYY-MM-DD` key for a date. Avoids the UTC shift `toISOString()` causes. */
export function toDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Minutes from midnight for "right now". */
export function nowMinutes(d: Date = new Date()): number {
  return d.getHours() * 60 + d.getMinutes();
}

/**
 * Rounds a minutes value to the nearest step (e.g. 5 for a 5-minute clock).
 * Keeps the result inside a single day.
 */
export function snapMinutes(min: number, step: number): number {
  if (step <= 1) return clampMinutes(min);
  return clampMinutes(Math.round(min / step) * step);
}
