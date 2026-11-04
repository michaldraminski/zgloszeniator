import { identityKey, type IncomingAthlete } from '@lenex-entries/core';

export function filterAthletes(
  athletes: readonly IncomingAthlete[],
  query: string,
  clubNamesByAthleteKey: ReadonlyMap<string, readonly string[]> = new Map(),
): IncomingAthlete[] {
  const normalizedQuery = query.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl');
  if (!normalizedQuery) {
    return [...athletes];
  }

  return athletes.filter((athlete) =>
    [
      athlete.lastName,
      athlete.firstName,
      String(athlete.birthYear),
      ...(clubNamesByAthleteKey.get(identityKey(athlete)) ?? []),
    ]
      .some((value) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl').includes(normalizedQuery)),
  );
}
