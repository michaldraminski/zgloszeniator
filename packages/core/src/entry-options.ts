import { identityKey } from './lenex';
import type { Course, EventGender, Gender, Meet, MeetEvent, IncomingAthlete } from './lenex';
import type { ImportedHistory, ImportedTimeObservation } from './history';
import { suggestImportedTime } from './history';

export class UnsupportedAgeDateType extends Error {
  constructor(type: string) {
    super(`Unsupported AGEDATE type: ${type}`);
    this.name = 'UnsupportedAgeDateType';
  }
}

export interface AthleteEventOption {
  event: MeetEvent;
  suggestedTime?: ImportedTimeObservation;
}

export interface AthleteEntryOptions {
  athlete: IncomingAthlete;
  athleteKey: string;
  age: number;
  events: AthleteEventOption[];
}

export interface RelayAgeWarning {
  athlete: IncomingAthlete;
  age: number;
  reason:
    | 'adult-in-junior'
    | 'over-category-limit'
    | 'adult-in-junior-and-over-category-limit';
}

export function getRelayAgeWarnings(
  meet: Meet,
  categoryName: string,
  ageMax: number | undefined,
  members: readonly IncomingAthlete[],
): RelayAgeWarning[] {
  const isJuniorCategory = /junior|młod/i.test(categoryName.normalize('NFC'));
  return members.flatMap<RelayAgeWarning>((athlete) => {
    const age = ageAt(meet, athlete.birthYear);
    const adultInJunior = isJuniorCategory && age >= 18;
    const overCategoryLimit = ageMax !== undefined && ageMax >= 0 && age > ageMax;
    if (adultInJunior && overCategoryLimit) {
      return [{ athlete, age, reason: 'adult-in-junior-and-over-category-limit' }];
    }
    if (adultInJunior) {
      return [{ athlete, age, reason: 'adult-in-junior' }];
    }
    if (overCategoryLimit) {
      return [{ athlete, age, reason: 'over-category-limit' }];
    }
    return [];
  });
}

export function getRelayMemberOptions(
  athletes: readonly IncomingAthlete[],
  selectedAthleteKeys: ReadonlySet<string>,
  relayGender: EventGender,
): IncomingAthlete[] {
  return athletes.filter((athlete) =>
    selectedAthleteKeys.has(identityKey(athlete)) &&
    (relayGender === 'X' || athlete.gender === relayGender),
  );
}

export function ageAt(meet: Meet, birthYear: number): number {
  const ageDate = meet.ageDate;
  if (!ageDate || ageDate.type !== 'YEAR') {
    throw new UnsupportedAgeDateType(ageDate?.type ?? '(missing)');
  }

  const yearMatch = /^(\d{4})(?:-\d{2}-\d{2})?$/.exec(ageDate.value);
  if (!yearMatch) {
    throw new Error(`Invalid AGEDATE@value: ${ageDate.value}`);
  }

  return Number(yearMatch[1]) - birthYear;
}

function normalizeDiscipline(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

export function resolveEvent(
  meet: Meet,
  gender: Gender,
  disciplineKey: string,
  age: number,
): MeetEvent | undefined {
  const normalizedKey = normalizeDiscipline(disciplineKey);
  const matches = meet.events.filter(
    (event) =>
      event.gender === gender &&
      event.disciplineKey !== undefined &&
      normalizeDiscipline(event.disciplineKey) === normalizedKey &&
      event.ageGroups.some(
        (group) => age >= (group.min < 0 ? Number.NEGATIVE_INFINITY : group.min) &&
          (group.max === null || age <= group.max),
      ),
  );

  return matches.length === 1 ? matches[0] : undefined;
}

export function buildAthleteEventOptions(
  meet: Meet,
  history: ImportedHistory,
  athleteKeys?: ReadonlySet<string>,
  referenceDate?: string,
): AthleteEntryOptions[] {
  return history.athletes
    .filter((athlete) => !athleteKeys || athleteKeys.has(identityKey(athlete)))
    .map((athlete) => {
    const athleteKey = identityKey(athlete);
    const age = ageAt(meet, athlete.birthYear);
    const disciplineKeys = new Set(
      meet.events
        .filter(
          (event): event is MeetEvent & { disciplineKey: string } =>
            event.gender === athlete.gender &&
            event.disciplineKey !== undefined,
        )
        .map((event) => event.disciplineKey),
    );
    const events = [...disciplineKeys]
      .flatMap((disciplineKey) => {
        const event = resolveEvent(meet, athlete.gender, disciplineKey, age);
        if (!event) {
          return [];
        }
        const suggestedTime = suggestImportedTime(
          history,
          athleteKey,
          disciplineKey,
          meet.course,
          referenceDate,
        );
        return [{ event, ...(suggestedTime ? { suggestedTime } : {}) }];
      })
      .sort((left, right) => left.event.number - right.event.number);

      return { athlete, athleteKey, age, events };
    });
}
