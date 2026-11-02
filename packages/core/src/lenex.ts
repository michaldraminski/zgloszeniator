import { XMLParser } from 'fast-xml-parser';

import { parseTime } from './time';

export type Gender = 'F' | 'M';
export type EventGender = Gender | 'X';
export type Course = 'SCM' | 'LCM';

export interface MeetEvent {
  eventId: string;
  number: number;
  sessionNumber: number;
  gender: EventGender;
  disciplineKey: string;
  relayCount: number;
  ageGroups: Array<{ name: string; min: number; max: number | null }>;
}

export interface Meet {
  key: string;
  name: string;
  course: Course;
  deadline?: string;
  maxEntriesPerAthlete?: number;
  ageDate?: { type: string; value: string };
  events: MeetEvent[];
  rawXml: string;
}

export interface ParsedEntry {
  eventId: string;
  disciplineKey: string;
  timeCs: number | null;
}

export interface ParsedAthlete {
  firstName: string;
  lastName: string;
  birthYear: number;
  gender: Gender;
  entries: ParsedEntry[];
}

export interface ParsedRelay {
  name: string;
  gender: EventGender;
  number: number;
  eventId: string;
  disciplineKey: string;
  timeCs: number | null;
}

export interface ParsedClub {
  name: string;
  contact: { name: string; phone: string; email: string };
  athletes: ParsedAthlete[];
  relays: ParsedRelay[];
}

export interface ParsedEntryFile {
  meet: Meet;
  clubs: ParsedClub[];
}

export interface IncomingAthlete {
  firstName: string;
  lastName: string;
  birthYear: number;
  gender: Gender;
}

export interface ValidResult {
  athlete: IncomingAthlete;
  disciplineKey: string;
  course: Course;
  timeCs: number;
}

export interface ParsedResults {
  meet: Meet;
  athletes: IncomingAthlete[];
  validResults: ValidResult[];
}

export type LenexDocumentType = 'invitation' | 'entry' | 'results';

export type ParsedLenexDocument =
  | { kind: 'invitation'; meet: Meet }
  | { kind: 'entry'; entryFile: ParsedEntryFile }
  | { kind: 'results'; results: ParsedResults };

export class LenexParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LenexParseError';
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
});

type XmlRecord = Record<string, unknown>;

function asRecord(value: unknown): XmlRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  return value as XmlRecord;
}

function children(value: unknown): XmlRecord[] {
  if (Array.isArray(value)) {
    return value.map(asRecord).filter((item): item is XmlRecord => item !== undefined);
  }
  const record = asRecord(value);
  return record ? [record] : [];
}

function child(record: XmlRecord, name: string): XmlRecord | undefined {
  return asRecord(record[name]);
}

function attr(record: XmlRecord | undefined, name: string): string | undefined {
  const value = record?.[`@_${name}`];
  return typeof value === 'string' ? value.trim() : undefined;
}

function requiredAttr(record: XmlRecord | undefined, name: string, context: string): string {
  const value = attr(record, name);
  if (!value) {
    throw new LenexParseError(`Missing ${context}@${name}`);
  }
  return value;
}

function integerAttr(
  record: XmlRecord | undefined,
  name: string,
  context: string,
  options: { required?: boolean; defaultValue?: number } = {},
): number {
  const value = attr(record, name);
  if (value === undefined || value === '') {
    if (options.required) {
      throw new LenexParseError(`Missing ${context}@${name}`);
    }
    return options.defaultValue ?? 0;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    throw new LenexParseError(`Invalid integer ${context}@${name}: ${value}`);
  }
  return parsed;
}

function parseXml(xml: string): XmlRecord {
  let parsed: unknown;
  try {
    parsed = parser.parse(xml) as unknown;
  } catch {
    throw new LenexParseError('Invalid LENEX XML');
  }
  const root = asRecord(parsed);
  const lenex = root ? child(root, 'LENEX') : undefined;
  if (!lenex) {
    throw new LenexParseError('Missing LENEX root element');
  }
  return lenex;
}

function containsElement(value: unknown, elementName: string): boolean {
  const record = asRecord(value);
  if (!record) {
    if (Array.isArray(value)) {
      return value.some((item) => containsElement(item, elementName));
    }
    return false;
  }

  return Object.entries(record).some(
    ([name, nested]) => name === elementName || containsElement(nested, elementName),
  );
}

export function detectLenexType(xml: string): LenexDocumentType {
  const lenex = parseXml(xml);
  if (containsElement(lenex, 'RESULT')) {
    return 'results';
  }
  if (containsElement(lenex, 'CLUBS') && containsElement(lenex, 'ENTRY')) {
    return 'entry';
  }
  return 'invitation';
}

function findMeet(lenex: XmlRecord): XmlRecord {
  const meets = child(lenex, 'MEETS');
  const meet = meets ? children(meets.MEET)[0] : undefined;
  if (!meet) {
    throw new LenexParseError('Missing MEETS/MEET element');
  }
  return meet;
}

function parseGender(value: string | undefined, context: string): EventGender {
  if (value === 'F' || value === 'M' || value === 'X') {
    return value;
  }
  throw new LenexParseError(`Unsupported ${context} gender: ${value ?? '(missing)'}`);
}

function parseAthleteGender(value: string | undefined): Gender {
  if (value === 'F' || value === 'M') {
    return value;
  }
  throw new LenexParseError(`Unsupported ATHLETE gender: ${value ?? '(missing)'}`);
}

function parseCourse(value: string | undefined): Course {
  if (value === 'SCM' || value === 'LCM') {
    return value;
  }
  throw new LenexParseError(`Unsupported MEET@course: ${value ?? '(missing)'}`);
}

function normalizeDiscipline(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

function parseMeet(xml: string, meetRecord: XmlRecord, requireAgeDate = true): Meet {
  const name = requiredAttr(meetRecord, 'name', 'MEET');
  const ageDateNode = child(meetRecord, 'AGEDATE');
  const ageDateType = attr(ageDateNode, 'type');
  const ageDateValue = attr(ageDateNode, 'value');
  if (requireAgeDate && !ageDateType) {
    throw new LenexParseError('Missing AGEDATE@type');
  }
  if (requireAgeDate && !ageDateValue) {
    throw new LenexParseError('Missing AGEDATE@value');
  }
  if (ageDateType && ageDateType !== 'YEAR') {
    throw new LenexParseError(`Unsupported AGEDATE type: ${ageDateType}`);
  }

  const sessions = child(meetRecord, 'SESSIONS');
  const events: MeetEvent[] = [];
  for (const session of sessions ? children(sessions.SESSION) : []) {
    const sessionNumber = integerAttr(session, 'number', 'SESSION', { required: true });
    const eventsNode = child(session, 'EVENTS');
    for (const event of eventsNode ? children(eventsNode.EVENT) : []) {
      const swimStyle = child(event, 'SWIMSTYLE');
      const disciplineKey = normalizeDiscipline(requiredAttr(swimStyle, 'name', 'SWIMSTYLE'));
      if (!disciplineKey) {
        throw new LenexParseError('SWIMSTYLE@name cannot be empty');
      }
      const ageGroupsNode = child(event, 'AGEGROUPS');
      const ageGroups = (ageGroupsNode ? children(ageGroupsNode.AGEGROUP) : []).map((ageGroup) => {
        const maxValue = integerAttr(ageGroup, 'agemax', 'AGEGROUP', { defaultValue: -1 });
        return {
          name: requiredAttr(ageGroup, 'name', 'AGEGROUP'),
          min: integerAttr(ageGroup, 'agemin', 'AGEGROUP', { defaultValue: -1 }),
          max: maxValue < 0 ? null : maxValue,
        };
      });
      events.push({
        eventId: requiredAttr(event, 'eventid', 'EVENT'),
        number: integerAttr(event, 'number', 'EVENT', { required: true }),
        sessionNumber,
        gender: parseGender(attr(event, 'gender'), 'EVENT'),
        disciplineKey,
        relayCount: integerAttr(swimStyle, 'relaycount', 'SWIMSTYLE'),
        ageGroups,
      });
    }
  }

  if (events.length === 0) {
    throw new LenexParseError('MEET does not contain any events');
  }

  const maxEntries = attr(meetRecord, 'maxentriesathlete');
  return {
    key: name,
    name,
    course: parseCourse(attr(meetRecord, 'course')),
    ...(attr(meetRecord, 'deadline') ? { deadline: attr(meetRecord, 'deadline') } : {}),
    ...(maxEntries !== undefined
      ? { maxEntriesPerAthlete: integerAttr(meetRecord, 'maxentriesathlete', 'MEET') }
      : {}),
    ...(ageDateType && ageDateValue ? { ageDate: { type: ageDateType, value: ageDateValue } } : {}),
    events,
    rawXml: xml,
  };
}

export function parseInvitation(xml: string): Meet {
  const lenex = parseXml(xml);
  return parseMeet(xml, findMeet(lenex));
}

function eventDisciplineMap(meet: Meet): Map<string, string> {
  return new Map(meet.events.map((event) => [event.eventId, event.disciplineKey]));
}

function resolveDiscipline(eventId: string, eventMap: Map<string, string>): string {
  const disciplineKey = eventMap.get(eventId);
  if (!disciplineKey) {
    throw new LenexParseError(`ENTRY references unknown eventid: ${eventId}`);
  }
  return disciplineKey;
}

function parseBirthYear(value: string | undefined, context: string): number {
  if (!value) {
    throw new LenexParseError(`Missing ${context}@birthdate`);
  }
  const match = /^(\d{4})(?:-\d{2}-\d{2})?$/.exec(value);
  if (!match) {
    throw new LenexParseError(`Invalid ${context}@birthdate: ${value}`);
  }
  return Number(match[1]);
}

function parseParsedEntries(container: XmlRecord | undefined, eventMap: Map<string, string>): ParsedEntry[] {
  const entriesNode = container ? child(container, 'ENTRIES') : undefined;
  return (entriesNode ? children(entriesNode.ENTRY) : []).map((entry) => {
    const eventId = requiredAttr(entry, 'eventid', 'ENTRY');
    const entryTime = attr(entry, 'entrytime');
    const timeCs = entryTime ? parseTime(entryTime) : null;
    if (entryTime && timeCs === null) {
      throw new LenexParseError(`Invalid ENTRY@entrytime: ${entryTime}`);
    }
    return {
      eventId,
      disciplineKey: resolveDiscipline(eventId, eventMap),
      timeCs,
    };
  });
}

export function parseEntryFile(xml: string): ParsedEntryFile {
  const lenex = parseXml(xml);
  const meet = parseMeet(xml, findMeet(lenex));
  const eventMap = eventDisciplineMap(meet);
  const clubsNode = child(lenex, 'CLUBS');
  const clubs = (clubsNode ? children(clubsNode.CLUB) : []).map((club): ParsedClub => {
    const contactNode = child(club, 'CONTACT');
    const athletesNode = child(club, 'ATHLETES');
    const relaysNode = child(club, 'RELAYS');
    const athletes = (athletesNode ? children(athletesNode.ATHLETE) : []).map((athlete) => ({
      firstName: requiredAttr(athlete, 'firstname', 'ATHLETE'),
      lastName: requiredAttr(athlete, 'lastname', 'ATHLETE'),
      birthYear: parseBirthYear(attr(athlete, 'birthdate'), 'ATHLETE'),
      gender: parseAthleteGender(attr(athlete, 'gender')),
      entries: parseParsedEntries(athlete, eventMap),
    }));
    const relays = (relaysNode ? children(relaysNode.RELAY) : []).flatMap((relay) => {
      const eventEntries = parseParsedEntries(relay, eventMap);
      return eventEntries.map((entry) => ({
        name: requiredAttr(relay, 'name', 'RELAY'),
        gender: parseGender(attr(relay, 'gender'), 'RELAY'),
        number: integerAttr(relay, 'number', 'RELAY', { defaultValue: 0 }),
        ...entry,
      }));
    });
    return {
      name: requiredAttr(club, 'name', 'CLUB'),
      contact: {
        name: attr(contactNode, 'name') ?? '',
        phone: attr(contactNode, 'phone') ?? '',
        email: attr(contactNode, 'email') ?? '',
      },
      athletes,
      relays,
    };
  });
  return { meet, clubs };
}

function normalizedIdentity(athlete: IncomingAthlete): string {
  const normalize = (value: string) => value.normalize('NFC').trim().toLowerCase();
  return [
    normalize(athlete.lastName),
    normalize(athlete.firstName),
    athlete.birthYear,
    athlete.gender,
  ].join('\u0000');
}

export function parseResults(xml: string): ParsedResults {
  const lenex = parseXml(xml);
  const meetRecord = findMeet(lenex);
  const meet = parseMeet(xml, meetRecord, false);
  const eventMap = eventDisciplineMap(meet);
  const clubsNode = child(meetRecord, 'CLUBS');
  const athletes: IncomingAthlete[] = [];
  const validResults: ValidResult[] = [];
  const seenAthletes = new Set<string>();

  for (const club of clubsNode ? children(clubsNode.CLUB) : []) {
    const athletesNode = child(club, 'ATHLETES');
    for (const athleteRecord of athletesNode ? children(athletesNode.ATHLETE) : []) {
      const athlete: IncomingAthlete = {
        firstName: requiredAttr(athleteRecord, 'firstname', 'ATHLETE'),
        lastName: requiredAttr(athleteRecord, 'lastname', 'ATHLETE'),
        birthYear: parseBirthYear(attr(athleteRecord, 'birthdate'), 'ATHLETE'),
        gender: parseAthleteGender(attr(athleteRecord, 'gender')),
      };
      const key = normalizedIdentity(athlete);
      if (!seenAthletes.has(key)) {
        athletes.push(athlete);
        seenAthletes.add(key);
      }
      const resultsNode = child(athleteRecord, 'RESULTS');
      for (const result of resultsNode ? children(resultsNode.RESULT) : []) {
        if (attr(result, 'status')) {
          continue;
        }
        const timeValue = attr(result, 'swimtime');
        const timeCs = timeValue ? parseTime(timeValue) : null;
        if (timeValue && timeCs === null) {
          throw new LenexParseError(`Invalid RESULT@swimtime: ${timeValue}`);
        }
        if (timeCs === null) {
          continue;
        }
        const eventId = requiredAttr(result, 'eventid', 'RESULT');
        validResults.push({
          athlete,
          disciplineKey: resolveDiscipline(eventId, eventMap),
          course: meet.course,
          timeCs,
        });
      }
    }
  }

  return { meet, athletes, validResults };
}

export function parseLenexDocument(xml: string): ParsedLenexDocument {
  const kind = detectLenexType(xml);
  switch (kind) {
    case 'invitation':
      return { kind, meet: parseInvitation(xml) };
    case 'entry':
      return { kind, entryFile: parseEntryFile(xml) };
    case 'results':
      return { kind, results: parseResults(xml) };
  }
}
