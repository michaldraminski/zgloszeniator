import { formatTime, parseTime } from '@lenex-entries/core';

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
