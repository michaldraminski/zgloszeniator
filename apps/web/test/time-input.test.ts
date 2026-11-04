import { describe, expect, it } from 'vitest';

import {
  adjustSwimTimeToSecond,
  adjustTimeToSecond,
  displaySwimTimeInput,
  formatSwimTime,
  normalizeSwimTimeInput,
  normalizeTimeInput,
  parseSwimTimeInput,
} from '../src/time-input';

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

describe('swim time input', () => {
  it('does not reformat active partial input and converts legacy stored LENEX values', () => {
    expect(displaySwimTimeInput('01:02.3')).toBe('01:02.3');
    expect(displaySwimTimeInput('01:02')).toBe('01:02');
    expect(displaySwimTimeInput('00:01:02.34')).toBe('01:02.34');
  });

  it('uses minutes, seconds, and centiseconds without displaying hours', () => {
    expect(normalizeSwimTimeInput('1:2.3')).toBe('01:02.30');
    expect(normalizeSwimTimeInput('12.3')).toBe('00:12.30');
    expect(normalizeSwimTimeInput('10234')).toBe('01:02.34');
    expect(normalizeSwimTimeInput('123456')).toBe('12:34.56');
    expect(normalizeSwimTimeInput('00:01:02.34')).toBe('01:02.34');
    expect(parseSwimTimeInput('01:02.34')).toBe(6234);
    expect(formatSwimTime(6234)).toBe('01:02.34');
  });

  it('supports long durations without truncating minutes and rejects malformed fields', () => {
    expect(normalizeSwimTimeInput('754:56.78')).toBe('754:56.78');
    expect(normalizeSwimTimeInput('99:59:59.99')).toBe('5999:59.99');
    expect(normalizeSwimTimeInput('6000:00.00')).toBeNull();
    expect(normalizeSwimTimeInput('12:77.22')).toBeNull();
    expect(normalizeSwimTimeInput('1:2:3')).toBeNull();
    expect(normalizeSwimTimeInput('1234567')).toBeNull();
    expect(parseSwimTimeInput('')).toBeNull();
  });

  it('rounds swim times to whole seconds and keeps the UI hour-free', () => {
    expect(adjustSwimTimeToSecond('01:02.34', 'up')).toBe('01:03.00');
    expect(adjustSwimTimeToSecond('01:02.34', 'down')).toBe('01:02.00');
    expect(adjustSwimTimeToSecond('01:02.00', 'up')).toBe('01:03.00');
    expect(adjustSwimTimeToSecond('00:00.00', 'down')).toBe('00:00.00');
  });
});
