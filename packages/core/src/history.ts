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
  clubNamesByAthleteKey: Map<string, string[]>;
  unresolvedResultCount: number;
}

function meetIdentity(name: string, city: string | undefined, course: Course): string {
  const normalize = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return `${normalize(name)}\u0000${normalize(city ?? '')}\u0000${course}`;
}

function normalizedLocation(city: string | undefined): string | undefined {
  const normalized = city?.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return normalized || undefined;
}

function normalizedClubName(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function getClubMismatch(
  knownClubNames: readonly string[],
  selectedClubName: string,
): string[] {
  const selected = normalizedClubName(selectedClubName);
  const distinctNames: string[] = [];
  for (const name of knownClubNames) {
    const trimmed = name.trim();
    if (trimmed && !distinctNames.some((existing) => normalizedClubName(existing) === normalizedClubName(trimmed))) {
      distinctNames.push(trimmed);
    }
  }
  if (!selected || distinctNames.length === 0) {
    return [];
  }
  if (distinctNames.some((name) => normalizedClubName(name) === selected)) {
    return [];
  }
  return distinctNames;
}

function eventSignature(event: {
  sessionNumber: number;
  number: number;
  gender: string;
  relayCount: number;
}): string {
  return [event.sessionNumber, event.number, event.gender, event.relayCount].join('|');
}

interface DisciplineInventory {
  course: Course;
  city?: string;
  labelsBySignature: Map<string, string>;
  eventSignatures: Set<string>;
  uniqueSchedule: boolean;
  allDisciplinesNamed: boolean;
}

function buildDisciplineInventory(meet: {
  course: Course;
  city?: string;
  events: Array<{
    sessionNumber: number;
    number: number;
    gender: string;
    relayCount: number;
    disciplineKey?: string;
  }>;
}): DisciplineInventory {
  const labelsBySignature = new Map<string, string>();
  const eventSignatures = new Set<string>();
  let uniqueSchedule = meet.events.length > 0;
  let allDisciplinesNamed = meet.events.length > 0;

  for (const event of meet.events) {
    const signature = eventSignature(event);
    if (eventSignatures.has(signature)) {
      uniqueSchedule = false;
      continue;
    }
    eventSignatures.add(signature);
    if (event.disciplineKey) {
      labelsBySignature.set(signature, event.disciplineKey);
    } else {
      allDisciplinesNamed = false;
    }
  }

  return {
    course: meet.course,
    city: normalizedLocation(meet.city),
    labelsBySignature,
    eventSignatures,
    uniqueSchedule,
    allDisciplinesNamed,
  };
}

function inventoriesMatch(results: DisciplineInventory, source: DisciplineInventory): boolean {
  if (
    !results.uniqueSchedule ||
    !source.uniqueSchedule ||
    !source.allDisciplinesNamed ||
    results.course !== source.course ||
    !results.city ||
    results.city !== source.city ||
    results.eventSignatures.size !== source.eventSignatures.size
  ) {
    return false;
  }

  return [...results.eventSignatures].every((signature) => source.eventSignatures.has(signature));
}

function compatibleInventory(
  results: DisciplineInventory,
  candidates: readonly DisciplineInventory[],
): DisciplineInventory | undefined {
  const matches = candidates.filter((candidate) => inventoriesMatch(results, candidate));
  const first = matches[0];
  if (!first) {
    return undefined;
  }

  const firstLabels = [...first.labelsBySignature.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
  const allAgree = matches.every((candidate) => {
    const labels = [...candidate.labelsBySignature.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
    return JSON.stringify(labels) === JSON.stringify(firstLabels);
  });

  return allAgree ? first : undefined;
}

export function collectImportedHistory(
  documents: readonly ParsedLenexDocument[],
  sourceFileNames: readonly string[] = [],
): ImportedHistory {
  const athletesByKey = new Map<string, IncomingAthlete>();
  const observations: ImportedTimeObservation[] = [];
  const clubNamesByAthleteKey = new Map<string, string[]>();
  const disciplineByMeetAndEvent = new Map<string, Map<string, string | null>>();
  const disciplineInventories: DisciplineInventory[] = [];

  for (const document of documents) {
    if (document.kind === 'invitation' || document.kind === 'entry') {
      const meet = document.kind === 'invitation' ? document.meet : document.entryFile.meet;
      const identity = meetIdentity(meet.name, meet.city, meet.course);
      const inventory = buildDisciplineInventory(meet);
      if (inventory.uniqueSchedule && inventory.allDisciplinesNamed) {
        disciplineInventories.push(inventory);
      }
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

  function addAthleteClub(athleteKey: string, clubName: string | undefined): void {
    const name = clubName?.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (!name) {
      return;
    }
    const names = clubNamesByAthleteKey.get(athleteKey) ?? [];
    if (!names.some((existing) => normalizedClubName(existing) === normalizedClubName(name))) {
      names.push(name);
      clubNamesByAthleteKey.set(athleteKey, names);
    }
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
          addAthleteClub(athleteKey, club.name);

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
      for (const association of document.results.athleteClubs ?? []) {
        addAthleteClub(identityKey(association.athlete), association.clubName);
      }
      const resultsInventory = buildDisciplineInventory(document.results.meet);
      const compatibleEventInventory = compatibleInventory(resultsInventory, disciplineInventories);
      const resultEventById = new Map(
        document.results.meet.events.map((event) => [event.eventId, event]),
      );
      for (const athlete of document.results.athletes) {
        addAthlete(athlete);
      }
      for (const result of document.results.validResults) {
        const event = resultEventById.get(result.eventId);
        const signature = event ? eventSignature(event) : undefined;
        const signatureDiscipline = signature
          ? compatibleEventInventory?.labelsBySignature.get(signature)
          : undefined;
        const eventDiscipline = disciplineByMeetAndEvent
          .get(meetIdentity(
            document.results.meet.name,
            document.results.meet.city,
            document.results.meet.course,
          ))
          ?.get(result.eventId);
        const disciplineKey = result.disciplineKey ??
          (eventDiscipline === null ? undefined : eventDiscipline ?? signatureDiscipline) ?? undefined;
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

  return {
    athletes,
    observations,
    clubNamesByAthleteKey,
    unresolvedResultCount,
  };
}

function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
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

function isWithinPreviousYear(value: string | undefined, referenceDate: string): boolean {
  if (!isIsoDate(value) || !isIsoDate(referenceDate)) {
    return false;
  }
  const [year, month, day] = referenceDate.split('-').map(Number);
  const cutoffYear = year - 1;
  const cutoffDay = Math.min(day, new Date(Date.UTC(cutoffYear, month, 0)).getUTCDate());
  const cutoff = `${cutoffYear.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${cutoffDay.toString().padStart(2, '0')}`;
  return value >= cutoff && value <= referenceDate;
}

export function suggestImportedTime(
  history: ImportedHistory,
  athleteKey: string,
  disciplineKey: string,
  course: Course,
  referenceDate?: string,
): ImportedTimeObservation | undefined {
  const matching = history.observations.filter(
    (observation) =>
      observation.athleteKey === athleteKey &&
      observation.disciplineKey === disciplineKey &&
      observation.course === course,
  );

  const results = matching.filter((observation) => observation.source.kind === 'result');
  const eligibleResults = referenceDate
    ? results.filter((observation) =>
        observation.source.meetDate === undefined ||
        isWithinPreviousYear(observation.source.meetDate, referenceDate),
      )
    : results;
  const bestResult = eligibleResults.sort(
    (left, right) => left.timeCs - right.timeCs || compareRecency(left, right),
  )[0];
  if (bestResult) {
    return bestResult;
  }

  return matching
    .filter((observation) => observation.source.kind === 'entry')
    .sort(compareRecency)[0];
}
