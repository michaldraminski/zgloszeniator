export function parseTime(value: string): number | null {
  const normalized = value.trim();

  if (!/^\d{2}:\d{2}:\d{2}\.\d{2}$/.test(normalized)) {
    return null;
  }

  const [hours, minutes, secondsAndCentiseconds] = normalized.split(':');
  const [seconds, centiseconds] = secondsAndCentiseconds.split('.');

  const hourValue = Number(hours);
  const minuteValue = Number(minutes);
  const secondValue = Number(seconds);
  const centisecondsValue = Number(centiseconds);

  if (
    [hourValue, minuteValue, secondValue, centisecondsValue].some((part) => Number.isNaN(part)) ||
    minuteValue > 59 ||
    secondValue > 59 ||
    centisecondsValue > 99
  ) {
    return null;
  }

  const totalCentiseconds =
    hourValue * 60 * 60 * 100 +
    minuteValue * 60 * 100 +
    secondValue * 100 +
    centisecondsValue;

  return totalCentiseconds;
}

export function formatTime(totalCentiseconds: number): string {
  if (!Number.isFinite(totalCentiseconds) || totalCentiseconds < 0) {
    return '00:00:00.00';
  }

  const centiseconds = Math.floor(totalCentiseconds) % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  const formatPart = (value: number) => value.toString().padStart(2, '0');

  return `${formatPart(hours)}:${formatPart(minutes)}:${formatPart(seconds)}.${formatPart(centiseconds)}`;
}
