import type { IncomingAthlete } from '@lenex-entries/core';

export function filterAthletes(
  athletes: readonly IncomingAthlete[],
  query: string,
): IncomingAthlete[] {
  const normalizedQuery = query.normalize('NFC').trim().toLocaleLowerCase('pl');
  if (!normalizedQuery) {
    return [...athletes];
  }

  return athletes.filter((athlete) =>
    [athlete.lastName, athlete.firstName, String(athlete.birthYear)]
      .some((value) => value.normalize('NFC').toLocaleLowerCase('pl').includes(normalizedQuery)),
  );
}
