import { describe, it, expect } from 'vitest';
import {
  MINUTES_PER_DAY,
  clampMinutes,
  wrapMinutes,
  formatTime,
  formatTime24,
  toClockParts,
  fromClockParts,
  formatDuration,
  toDateKey,
  nowMinutes,
  snapMinutes,
} from './time';

describe('clampMinutes', () => {
  it('returns 0 for non-finite input', () => {
    expect(clampMinutes(NaN)).toBe(0);
    expect(clampMinutes(Infinity)).toBe(0);
  });

  it('clamps values below 0 up to 0', () => {
    expect(clampMinutes(-10)).toBe(0);
  });

  it('clamps values at or above MINUTES_PER_DAY down to the last minute', () => {
    expect(clampMinutes(MINUTES_PER_DAY)).toBe(MINUTES_PER_DAY - 1);
    expect(clampMinutes(5000)).toBe(MINUTES_PER_DAY - 1);
  });

  it('rounds and returns an in-range value unchanged', () => {
    expect(clampMinutes(90.4)).toBe(90);
    expect(clampMinutes(90.6)).toBe(91);
  });
});

describe('wrapMinutes', () => {
  it('wraps negative values into range', () => {
    expect(wrapMinutes(-10)).toBe(MINUTES_PER_DAY - 10);
  });

  it('leaves an already in-range value unchanged', () => {
    expect(wrapMinutes(600)).toBe(600);
  });

  it('wraps a value beyond one day back to 0-based', () => {
    expect(wrapMinutes(MINUTES_PER_DAY + 30)).toBe(30);
  });
});

describe('formatTime', () => {
  it('formats a morning (AM) time with zero-padded minutes', () => {
    expect(formatTime(9 * 60 + 5)).toBe('9:05 AM');
  });

  it('formats an afternoon (PM) time and converts 0/12 hour correctly', () => {
    expect(formatTime(13 * 60)).toBe('1:00 PM');
    expect(formatTime(0)).toBe('12:00 AM');
    expect(formatTime(12 * 60)).toBe('12:00 PM');
  });
});

describe('formatTime24', () => {
  it('zero-pads hours and minutes', () => {
    expect(formatTime24(5)).toBe('00:05');
  });

  it('formats a full two-digit hour and minute', () => {
    expect(formatTime24(23 * 60 + 45)).toBe('23:45');
  });
});

describe('toClockParts', () => {
  it('splits an AM time correctly, including the 12am edge case', () => {
    expect(toClockParts(0)).toEqual({ hour24: 0, hour12: 12, minute: 0, period: 'AM' });
  });

  it('splits a PM time correctly, including the 12pm edge case', () => {
    expect(toClockParts(12 * 60 + 30)).toEqual({ hour24: 12, hour12: 12, minute: 30, period: 'PM' });
    expect(toClockParts(14 * 60)).toEqual({ hour24: 14, hour12: 2, minute: 0, period: 'PM' });
  });
});

describe('fromClockParts', () => {
  it('rebuilds AM minutes, treating 12 AM as hour 0', () => {
    expect(fromClockParts(12, 0, 'AM')).toBe(0);
    expect(fromClockParts(9, 5, 'AM')).toBe(9 * 60 + 5);
  });

  it('rebuilds PM minutes, treating 12 PM as hour 12', () => {
    expect(fromClockParts(12, 0, 'PM')).toBe(12 * 60);
    expect(fromClockParts(1, 0, 'PM')).toBe(13 * 60);
  });

  it('wraps an out-of-range minute value within the same hour', () => {
    expect(fromClockParts(1, 65, 'AM')).toBe(1 * 60 + 5);
    expect(fromClockParts(1, -5, 'AM')).toBe(1 * 60 + 55);
  });
});

describe('formatDuration', () => {
  it('formats a duration under one hour as minutes only', () => {
    expect(formatDuration(0, 45)).toBe('45m');
  });

  it('formats a duration on an exact hour boundary as hours only', () => {
    expect(formatDuration(0, 120)).toBe('2h');
  });

  it('formats a duration with both hours and minutes', () => {
    expect(formatDuration(0, 90)).toBe('1h 30m');
  });

  it('never returns a negative duration when end precedes start', () => {
    expect(formatDuration(100, 50)).toBe('0m');
  });
});

describe('toDateKey', () => {
  it('formats a given date as zero-padded YYYY-MM-DD', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('defaults to the current date when none is given', () => {
    expect(toDateKey()).toBe(toDateKey(new Date()));
  });
});

describe('nowMinutes', () => {
  it('converts a date object into minutes from midnight', () => {
    expect(nowMinutes(new Date(2026, 0, 1, 9, 30))).toBe(9 * 60 + 30);
  });
});

describe('snapMinutes', () => {
  it('falls back to plain clamping when step is 1 or less', () => {
    expect(snapMinutes(91, 1)).toBe(91);
    expect(snapMinutes(91, 0)).toBe(91);
  });

  it('rounds to the nearest step when step is greater than 1', () => {
    expect(snapMinutes(92, 5)).toBe(90);
    expect(snapMinutes(93, 5)).toBe(95);
  });
});
