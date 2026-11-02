import { identityKey } from './lenex';
import type { Course, IncomingAthlete, ParsedLenexDocument } from './lenex';

export type ImportedTimeSource =
  | { kind: 'entry'; meetName: string }
  | { kind: 'result'; meetName: string };

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

  for (const document of documents) {
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
              source: { kind: 'entry', meetName: document.entryFile.meet.name },
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
          source: { kind: 'result', meetName: document.results.meet.name },
        });
      }
    }
  }

  return { athletes: [...athletesByKey.values()], observations };
}
