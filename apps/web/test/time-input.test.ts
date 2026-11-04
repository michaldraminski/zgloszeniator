import { describe, expect, it } from 'vitest';

import { adjustTimeToSecond, normalizeTimeInput } from '../src/time-input';

describe('normalizeTimeInput', () => {
  it('accepts canonical LENEX times unchanged', () => {
    expect(normalizeTimeInput('00:04:23.33')).toBe('00:04:23.33');
  });

  it('accepts coach-friendly minutes, seconds and centiseconds without the hour prefix', () => {
    expect(normalizeTimeInput('1:02.34')).toBe('00:01:02.34');
    expect(normalizeTimeInput('1:2.3')).toBe('00:01:02.30');
    expect(normalizeTimeInput('12.3')).toBe('00:00:12.30');
  });

  it('accepts digits without separators and inserts them by position', () => {
    expect(normalizeTimeInput('10234')).toBe('00:01:02.34');
    expect(normalizeTimeInput('1234')).toBe('00:00:12.34');
    expect(normalizeTimeInput('12345678')).toBe('12:34:56.78');
  });

  it('rejects malformed, out-of-range and empty values', () => {
    expect(normalizeTimeInput('')).toBeNull();
    expect(normalizeTimeInput('1:77.22')).toBeNull();
    expect(normalizeTimeInput('77.22')).toBeNull();
    expect(normalizeTimeInput('1:2:3')).toBeNull();
    expect(normalizeTimeInput('123456789')).toBeNull();
  });
});

describe('adjustTimeToSecond', () => {
  it('rounds fractional times up or down to a whole second', () => {
    expect(adjustTimeToSecond('1:02.34', 'up')).toBe('00:01:03.00');
    expect(adjustTimeToSecond('1:02.34', 'down')).toBe('00:01:02.00');
  });

  it('moves an already rounded time by one second and never goes below zero', () => {
    expect(adjustTimeToSecond('00:00:12.00', 'up')).toBe('00:00:13.00');
    expect(adjustTimeToSecond('00:00:12.00', 'down')).toBe('00:00:11.00');
    expect(adjustTimeToSecond('00:00:00.00', 'down')).toBe('00:00:00.00');
  });

  it('does not alter empty or invalid input', () => {
    expect(adjustTimeToSecond('', 'up')).toBeNull();
    expect(adjustTimeToSecond('not a time', 'down')).toBeNull();
  });
});
