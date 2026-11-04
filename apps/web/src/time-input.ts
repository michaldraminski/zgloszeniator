import { formatTime, parseTime } from '@lenex-entries/core';

/** Format centiseconds as minutes:seconds.centiseconds for the coach-facing UI. */
export function formatSwimTime(timeCs: number): string {
  if (!Number.isSafeInteger(timeCs) || timeCs < 0) {
    return '00:00.00';
  }
  const totalSeconds = Math.floor(timeCs / 100);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = timeCs % 100;
  const part = (value: number) => value.toString().padStart(2, '0');
  return `${part(minutes)}:${part(seconds)}.${part(centiseconds)}`;
}

/** Normalize user input to minutes:seconds.centiseconds without losing duration. */
export function normalizeSwimTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const legacyLenexMatch = /^(\d{1,2}):(\d{2}):(\d{2})\.(\d{2})$/.exec(trimmed);
  if (legacyLenexMatch) {
    const [, hourPart, minutePart, secondPart, centisecondPart] = legacyLenexMatch;
    const hours = Number(hourPart);
    const minutes = Number(minutePart);
    const seconds = Number(secondPart);
    if (minutes > 59 || seconds > 59) return null;
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes > 5999) return null;
    return formatSwimTime((totalMinutes * 60 + seconds) * 100 + Number(centisecondPart));
  }

  const minuteSecondMatch = /^(\d{1,5}):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (minuteSecondMatch) {
    const [, minutePart, secondPart, centisecondPart = '00'] = minuteSecondMatch;
    const seconds = Number(secondPart);
    if (seconds > 59 || Number(minutePart) > 5999) return null;
    return formatSwimTime(
      (Number(minutePart) * 60 + seconds) * 100 + Number(centisecondPart.padEnd(2, '0')),
    );
  }

  const secondsMatch = /^(\d{1,2})(?:\.(\d{1,2}))$/.exec(trimmed);
  if (secondsMatch) {
    const [, secondPart, centisecondPart] = secondsMatch;
    const seconds = Number(secondPart);
    if (seconds > 59) return null;
    return formatSwimTime(seconds * 100 + Number(centisecondPart.padEnd(2, '0')));
  }

  if (/^\d{1,6}$/.test(trimmed)) {
    const digits = trimmed.padStart(6, '0');
    const minutes = Number(digits.slice(0, 2));
    const seconds = Number(digits.slice(2, 4));
    if (seconds > 59) return null;
    return formatSwimTime((minutes * 60 + seconds) * 100 + Number(digits.slice(4, 6)));
  }

  return null;
}

/** Convert old persisted LENEX values for display without rewriting active partial input. */
export function displaySwimTimeInput(value: string): string {
  return /^\d{2}:\d{2}:\d{2}\.\d{2}$/.test(value)
    ? normalizeSwimTimeInput(value) ?? value
    : value;
}

export interface SwimTimeSegments {
  minutes: string;
  seconds: string;
  centiseconds: string;
}

/** Split a full, legacy, or actively edited time value into independent UI segments. */
export function splitSwimTimeInput(value: string): SwimTimeSegments {
  const legacyDisplayValue = displaySwimTimeInput(value.trim());
  const match = /^(\d{0,4}):(\d{0,2})\.(\d{0,2})$/.exec(legacyDisplayValue);
  if (match) {
    return { minutes: match[1], seconds: match[2], centiseconds: match[3] };
  }

  const normalized = normalizeSwimTimeInput(legacyDisplayValue);
  if (normalized) {
    const [minutes, rest] = normalized.split(':');
    const [seconds, centiseconds] = rest.split('.');
    return { minutes, seconds, centiseconds };
  }

  return { minutes: '', seconds: '', centiseconds: '' };
}

export function parseSwimTimeInput(value: string): number | null {
  const normalized = normalizeSwimTimeInput(value);
  if (!normalized) return null;
  const [minutePart, secondsAndCentiseconds] = normalized.split(':');
  const [secondPart, centisecondPart] = secondsAndCentiseconds.split('.');
  const total = (Number(minutePart) * 60 + Number(secondPart)) * 100 + Number(centisecondPart);
  return Number.isSafeInteger(total) ? total : null;
}

export function adjustSwimTimeToSecond(value: string, direction: 'up' | 'down'): string | null {
  const timeCs = parseSwimTimeInput(value);
  if (timeCs === null) return null;
  const wholeSeconds = Math.floor(timeCs / 100);
  const adjustedSeconds = timeCs % 100 === 0
    ? Math.max(0, wholeSeconds + (direction === 'up' ? 1 : -1))
    : direction === 'up' ? wholeSeconds + 1 : wholeSeconds;
  return formatSwimTime(adjustedSeconds * 100);
}

/** Normalize common coach-friendly time inputs into canonical LENEX hh:mm:ss.cc form. */
export function normalizeTimeInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const canonicalTime = parseTime(trimmed);
  if (canonicalTime !== null) {
    return formatTime(canonicalTime);
  }

  const minuteSecondMatch = /^(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/.exec(trimmed);
  if (minuteSecondMatch) {
    const [, minutePart, secondPart, centisecondPart = '00'] = minuteSecondMatch;
    const minutes = Number(minutePart);
    const seconds = Number(secondPart);
    if (minutes > 59 || seconds > 59) {
      return null;
    }
    const parsed = parseTime(
      `00:${minutePart.padStart(2, '0')}:${secondPart.padStart(2, '0')}.${centisecondPart.padEnd(2, '0')}`,
    );
    return parsed === null ? null : formatTime(parsed);
  }

  const secondsMatch = /^(\d{1,2})(?:\.(\d{1,2}))$/.exec(trimmed);
  if (secondsMatch) {
    const [, secondPart, centisecondPart] = secondsMatch;
    const seconds = Number(secondPart);
    if (seconds > 59) {
      return null;
    }
    const parsed = parseTime(`00:00:${secondPart.padStart(2, '0')}.${centisecondPart.padEnd(2, '0')}`);
    return parsed === null ? null : formatTime(parsed);
  }

  if (/^\d{1,8}$/.test(trimmed)) {
    const digits = trimmed.padStart(8, '0');
    const parsed = parseTime(
      `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4, 6)}.${digits.slice(6, 8)}`,
    );
    return parsed === null ? null : formatTime(parsed);
  }

  return null;
}

/** Round to a whole second; when already rounded, move by one second. */
export function adjustTimeToSecond(value: string, direction: 'up' | 'down'): string | null {
  const normalized = normalizeTimeInput(value);
  if (!normalized) {
    return null;
  }
  const timeCs = parseTime(normalized);
  if (timeCs === null) {
    return null;
  }

  const wholeSeconds = Math.floor(timeCs / 100);
  const adjustedSeconds = timeCs % 100 === 0
    ? Math.max(0, wholeSeconds + (direction === 'up' ? 1 : -1))
    : direction === 'up' ? wholeSeconds + 1 : wholeSeconds;
  return formatTime(adjustedSeconds * 100);
}
