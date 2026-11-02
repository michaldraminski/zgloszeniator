import { identityKey } from './lenex';
import type { Course, IncomingAthlete, ParsedLenexDocument } from './lenex';

export type ImportedTimeSource =
  | { kind: 'entry'; meetName: string; meetDate?: string; documentOrder: number }
  | { kind: 'result'; meetName: string; meetDate?: string; documentOrder: number };

export interface ImportedTimeObservation {
  athleteKey: string;
  disciplineKey: string;
  course: Course;
  timeCs: number;
  source: ImportedTimeSource;
}

export interface ImportedHistory {
  athletes: IncomingAthlete[];
  observations: ImportedTimeObservation[];
}

export function collectImportedHistory(
  documents: readonly ParsedLenexDocument[],
): ImportedHistory {
  const athletesByKey = new Map<string, IncomingAthlete>();
  const observations: ImportedTimeObservation[] = [];

  function addAthlete(athlete: IncomingAthlete): string {
    const key = identityKey(athlete);
    if (!athletesByKey.has(key)) {
      athletesByKey.set(key, athlete);
    }
    return key;
  }

  for (const [documentOrder, document] of documents.entries()) {
    if (document.kind === 'entry') {
      for (const club of document.entryFile.clubs) {
        for (const parsedAthlete of club.athletes) {
          const athlete: IncomingAthlete = {
            firstName: parsedAthlete.firstName,
            lastName: parsedAthlete.lastName,
            birthYear: parsedAthlete.birthYear,
            gender: parsedAthlete.gender,
          };
          const athleteKey = addAthlete(athlete);

          for (const entry of parsedAthlete.entries) {
            if (entry.timeCs === null) {
              continue;
            }
            observations.push({
              athleteKey,
              disciplineKey: entry.disciplineKey,
              course: document.entryFile.meet.course,
              timeCs: entry.timeCs,
              source: {
                kind: 'entry',
                meetName: document.entryFile.meet.name,
                ...(document.entryFile.meet.meetDate
                  ? { meetDate: document.entryFile.meet.meetDate }
                  : {}),
                documentOrder,
              },
            });
          }
        }
      }
      continue;
    }

    if (document.kind === 'results') {
      for (const athlete of document.results.athletes) {
        addAthlete(athlete);
      }
      for (const result of document.results.validResults) {
        const athleteKey = addAthlete(result.athlete);
        observations.push({
          athleteKey,
          disciplineKey: result.disciplineKey,
          course: result.course,
          timeCs: result.timeCs,
          source: {
            kind: 'result',
            meetName: document.results.meet.name,
            ...(document.results.meet.meetDate ? { meetDate: document.results.meet.meetDate } : {}),
            documentOrder,
          },
        });
      }
    }
  }

  return { athletes: [...athletesByKey.values()], observations };
}

function isIsoDate(value: string | undefined): value is string {
  return value !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function compareRecency(
  left: ImportedTimeObservation,
  right: ImportedTimeObservation,
): number {
  const leftDate = isIsoDate(left.source.meetDate) ? left.source.meetDate : undefined;
  const rightDate = isIsoDate(right.source.meetDate) ? right.source.meetDate : undefined;
  if (leftDate && rightDate && leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }
  if (left.source.documentOrder !== right.source.documentOrder) {
    return right.source.documentOrder - left.source.documentOrder;
  }
  return left.timeCs - right.timeCs;
}

export function suggestImportedTime(
  history: ImportedHistory,
  athleteKey: string,
  disciplineKey: string,
  course: Course,
): ImportedTimeObservation | undefined {
  const matching = history.observations.filter(
    (observation) =>
      observation.athleteKey === athleteKey &&
      observation.disciplineKey === disciplineKey &&
      observation.course === course,
  );

  for (const kind of ['result', 'entry'] as const) {
    const preferred = matching
      .filter((observation) => observation.source.kind === kind)
      .sort(compareRecency)[0];
    if (preferred) {
      return preferred;
    }
  }
  return undefined;
}
