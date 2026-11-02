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
  sourceFileName?: string;
  source: ImportedTimeSource;
}

export interface ImportedHistory {
  athletes: IncomingAthlete[];
  observations: ImportedTimeObservation[];
  unresolvedResultCount: number;
}

function meetIdentity(name: string, city?: string): string {
  const normalize = (value: string) => value.normalize('NFC').trim().toLowerCase();
  return `${normalize(name)}\u0000${normalize(city ?? '')}`;
}

export function collectImportedHistory(
  documents: readonly ParsedLenexDocument[],
  sourceFileNames: readonly string[] = [],
): ImportedHistory {
  const athletesByKey = new Map<string, IncomingAthlete>();
  const observations: ImportedTimeObservation[] = [];
  const disciplineByMeetAndEvent = new Map<string, Map<string, string | null>>();

  for (const document of documents) {
    if (document.kind === 'invitation' || document.kind === 'entry') {
      const meet = document.kind === 'invitation' ? document.meet : document.entryFile.meet;
      const identity = meetIdentity(meet.name, meet.city);
      let eventMap = disciplineByMeetAndEvent.get(identity);
      if (!eventMap) {
        eventMap = new Map();
        disciplineByMeetAndEvent.set(identity, eventMap);
      }
      for (const event of meet.events) {
        if (!event.disciplineKey) {
          continue;
        }
        const existing = eventMap.get(event.eventId);
        if (existing !== undefined && existing !== event.disciplineKey) {
          eventMap.set(event.eventId, null);
        } else if (existing === undefined) {
          eventMap.set(event.eventId, event.disciplineKey);
        }
      }
    }
  }

  function addAthlete(athlete: IncomingAthlete): string {
    const key = identityKey(athlete);
    if (!athletesByKey.has(key)) {
      athletesByKey.set(key, athlete);
    }
    return key;
  }

  let unresolvedResultCount = 0;
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
              ...(sourceFileNames[documentOrder]
                ? { sourceFileName: sourceFileNames[documentOrder] }
                : {}),
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
        const disciplineKey = result.disciplineKey ??
          disciplineByMeetAndEvent
            .get(meetIdentity(document.results.meet.name, document.results.meet.city))
            ?.get(result.eventId) ?? undefined;
        if (!disciplineKey) {
          unresolvedResultCount += 1;
          continue;
        }
        const athleteKey = addAthlete(result.athlete);
        observations.push({
          athleteKey,
          disciplineKey,
          course: result.course,
          timeCs: result.timeCs,
          ...(sourceFileNames[documentOrder] ? { sourceFileName: sourceFileNames[documentOrder] } : {}),
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

  const collator = new Intl.Collator('pl', { sensitivity: 'base' });
  const athletes = [...athletesByKey.values()].sort(
    (left, right) =>
      collator.compare(left.lastName, right.lastName) ||
      collator.compare(left.firstName, right.firstName) ||
      left.birthYear - right.birthYear ||
      left.gender.localeCompare(right.gender),
  );

  return { athletes, observations, unresolvedResultCount };
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
