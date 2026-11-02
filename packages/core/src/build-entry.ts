import { encodeWindows1250, decodeWindows1250 } from './encoding';
import { ageAt, resolveEvent } from './entry-options';
import { identityKey } from './lenex';
import type { Meet, Gender, EventGender } from './lenex';
import { formatTime, parseTime } from './time';
import { writeLxf } from './container';

export interface EntryDraftAthlete {
  firstName: string;
  lastName: string;
  birthYear: number;
  gender: Gender;
  entries: Array<{ eventId: string; timeCs: number }>;
}

export interface EntryDraftRelay {
  eventId: string;
  number: number;
  name: string;
  gender: EventGender;
  timeCs: number;
  ageMin?: number;
  ageMax?: number;
  memberAthleteKeys?: string[];
}

export interface EntryFileDraft {
  club: {
    name: string;
    contact: { name: string; phone: string; email: string };
  };
  athletes: EntryDraftAthlete[];
  relays?: EntryDraftRelay[];
}

export class EntryFileGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntryFileGenerationError';
  }
}

function xmlAttribute(value: string): string {
  let escaped = '';
  for (const character of value) {
    if (character === '&') {
      escaped += '&amp;';
    } else if (character === '<') {
      escaped += '&lt;';
    } else if (character === '>') {
      escaped += '&gt;';
    } else if (character === '"') {
      escaped += '&quot;';
    } else if (decodeWindows1250(encodeWindows1250(character)) !== character) {
      escaped += `&#${character.codePointAt(0)};`;
    } else {
      escaped += character;
    }
  }
  return escaped;
}

function validateDraft(meet: Meet, draft: EntryFileDraft): void {
  const relays = draft.relays ?? [];
  const relayMemberKeys = new Set(relays.flatMap((relay) => relay.memberAthleteKeys ?? []));
  if (!draft.club.name.trim()) {
    throw new EntryFileGenerationError('Club name is required');
  }
  if (draft.athletes.length === 0 && relays.length === 0) {
    throw new EntryFileGenerationError('At least one athlete entry or relay is required');
  }

  const athleteKeys = new Set<string>();
  for (const athlete of draft.athletes) {
    if (!athlete.firstName.trim() || !athlete.lastName.trim()) {
      throw new EntryFileGenerationError('Athlete first and last names are required');
    }
    if (!Number.isSafeInteger(athlete.birthYear) || athlete.birthYear < 1900 || athlete.birthYear > 2100) {
      throw new EntryFileGenerationError('Invalid athlete birth year');
    }
    const athleteKey = [
      athlete.lastName.normalize('NFC').trim().toLowerCase(),
      athlete.firstName.normalize('NFC').trim().toLowerCase(),
      athlete.birthYear,
      athlete.gender,
    ].join('\u0000');
    if (athleteKeys.has(athleteKey)) {
      throw new EntryFileGenerationError('Duplicate athlete in entry draft');
    }
    athleteKeys.add(athleteKey);
    if (athlete.entries.length === 0 && !relayMemberKeys.has(athleteKey)) {
      throw new EntryFileGenerationError('Each included athlete must have at least one entry');
    }
    if (meet.maxEntriesPerAthlete !== undefined && athlete.entries.length > meet.maxEntriesPerAthlete) {
      throw new EntryFileGenerationError('Athlete exceeds MEET@maxentriesathlete');
    }

    const age = ageAt(meet, athlete.birthYear);
    const disciplines = new Set<string>();
    const eventIds = new Set<string>();
    for (const entry of athlete.entries) {
      if (
        !Number.isSafeInteger(entry.timeCs) ||
        entry.timeCs < 0 ||
        parseTime(formatTime(entry.timeCs)) !== entry.timeCs
      ) {
        throw new EntryFileGenerationError('Invalid entry time');
      }
      const event = meet.events.find((candidate) => candidate.eventId === entry.eventId);
      if (!event || event.gender !== athlete.gender || !event.disciplineKey) {
        throw new EntryFileGenerationError(`Unknown event for athlete: ${entry.eventId}`);
      }
      if (eventIds.has(entry.eventId)) {
        throw new EntryFileGenerationError('Duplicate event for athlete');
      }
      eventIds.add(entry.eventId);
      const resolved = resolveEvent(meet, athlete.gender, event.disciplineKey, age);
      if (!resolved || resolved.eventId !== event.eventId) {
        throw new EntryFileGenerationError(`Event is not age-eligible for athlete: ${entry.eventId}`);
      }
      if (disciplines.has(event.disciplineKey.toLocaleLowerCase('und'))) {
        throw new EntryFileGenerationError('Duplicate discipline for athlete');
      }
      disciplines.add(event.disciplineKey.toLocaleLowerCase('und'));
    }
  }

  for (const relay of relays) {
    if (!relay.name.trim()) {
      throw new EntryFileGenerationError('Relay name/category is required');
    }
    if (!Number.isSafeInteger(relay.number) || relay.number < 1) {
      throw new EntryFileGenerationError('Invalid relay number');
    }
    if (
      !Number.isSafeInteger(relay.timeCs) ||
      relay.timeCs < 0 ||
      parseTime(formatTime(relay.timeCs)) !== relay.timeCs
    ) {
      throw new EntryFileGenerationError('Invalid relay time');
    }
    const event = meet.events.find((candidate) => candidate.eventId === relay.eventId);
    if (!event || event.relayCount <= 1 || event.gender !== relay.gender) {
      throw new EntryFileGenerationError(`Unknown relay event: ${relay.eventId}`);
    }
    if (relay.ageMin !== undefined && !Number.isSafeInteger(relay.ageMin)) {
      throw new EntryFileGenerationError('Invalid relay age minimum');
    }
    if (relay.ageMax !== undefined && !Number.isSafeInteger(relay.ageMax)) {
      throw new EntryFileGenerationError('Invalid relay age maximum');
    }
    if (
      relay.ageMin !== undefined &&
      relay.ageMax !== undefined &&
      relay.ageMin >= 0 &&
      relay.ageMax >= 0 &&
      relay.ageMin > relay.ageMax
    ) {
      throw new EntryFileGenerationError('Relay age minimum exceeds maximum');
    }
    const memberKeys = relay.memberAthleteKeys ?? [];
    if (memberKeys.length > event.relayCount) {
      throw new EntryFileGenerationError('Too many relay members');
    }
    if (new Set(memberKeys).size !== memberKeys.length) {
      throw new EntryFileGenerationError('Relay athlete cannot occupy multiple positions');
    }
    const rosterKeys = new Set(draft.athletes.map((athlete) => identityKey(athlete)));
    if (memberKeys.some((key) => !rosterKeys.has(key))) {
      throw new EntryFileGenerationError('Relay member is not in the roster');
    }
    if (event.gender !== 'X') {
      const rosterByKey = new Map(draft.athletes.map((athlete) => [identityKey(athlete), athlete]));
      if (memberKeys.some((key) => rosterByKey.get(key)?.gender !== event.gender)) {
        throw new EntryFileGenerationError('Relay member gender does not match the relay event');
      }
    }
  }
}

function renderClub(draft: EntryFileDraft): string {
  const athleteIds = new Map(
    draft.athletes.map((athlete, index) => [identityKey(athlete), index + 1]),
  );
  const athletesXml = draft.athletes.map((athlete, athleteIndex) => {
    const entriesXml = athlete.entries.map((entry) =>
      `          <ENTRY eventid="${xmlAttribute(entry.eventId)}" entrytime="${formatTime(entry.timeCs)}" />`,
    ).join('\r\n');
    const entriesXmlBlock = athlete.entries.length > 0
      ? ['          <ENTRIES>', entriesXml, '          </ENTRIES>']
      : ['          <ENTRIES />'];
    return [
      `        <ATHLETE lastname="${xmlAttribute(athlete.lastName.trim())}" firstname="${xmlAttribute(athlete.firstName.trim())}" birthdate="${athlete.birthYear}-01-01" gender="${athlete.gender}" athleteid="${athleteIndex + 1}">`,
      ...entriesXmlBlock,
      '        </ATHLETE>',
    ].join('\r\n');
  }).join('\r\n');

  const relayList = draft.relays ?? [];
  const relaysXml = relayList.map((relay, relayIndex) => {
    const ageMin = relay.ageMin === undefined ? '' : ` agemin="${relay.ageMin}"`;
    const ageMax = relay.ageMax === undefined ? '' : ` agemax="${relay.ageMax}"`;
    const memberAthleteKeys = relay.memberAthleteKeys ?? [];
    const positionsXml = memberAthleteKeys.map((athleteKey, positionIndex) => {
      const athleteId = athleteIds.get(athleteKey);
      if (!athleteId) {
        throw new EntryFileGenerationError('Relay member is not in the roster');
      }
      return `          <RELAYPOSITION number="${positionIndex + 1}" athleteid="${athleteId}" />`;
    }).join('\r\n');
    return [
      `        <RELAY gender="${relay.gender}" number="${relay.number}" name="${xmlAttribute(relay.name.trim())}"${ageMin}${ageMax} relayid="${relayIndex + 1}">`,
      '          <ENTRIES>',
      `            <ENTRY eventid="${xmlAttribute(relay.eventId)}" entrytime="${formatTime(relay.timeCs)}" />`,
      '          </ENTRIES>',
      ...(memberAthleteKeys.length > 0
        ? ['          <RELAYPOSITIONS>', positionsXml, '          </RELAYPOSITIONS>']
        : []),
      '        </RELAY>',
    ].join('\r\n');
  }).join('\r\n');

  return [
    '  <CLUBS>',
    `    <CLUB name="${xmlAttribute(draft.club.name.trim())}">`,
    `      <CONTACT name="${xmlAttribute(draft.club.contact.name.trim())}" phone="${xmlAttribute(draft.club.contact.phone.trim())}" email="${xmlAttribute(draft.club.contact.email.trim())}" />`,
    '      <ATHLETES>',
    athletesXml,
    '      </ATHLETES>',
    relayList.length > 0 ? '      <RELAYS>' : '      <RELAYS />',
    ...(relayList.length > 0 ? [relaysXml, '      </RELAYS>'] : []),
    '    </CLUB>',
    '  </CLUBS>',
  ].join('\r\n');
}

function setLenexVersion(xml: string): string {
  const rootMatch = /<LENEX\b[^>]*>/i.exec(xml);
  if (!rootMatch) {
    throw new EntryFileGenerationError('Invitation is missing the LENEX root element');
  }
  const rootTag = rootMatch[0];
  let updatedRootTag: string;
  if (/\bversion\s*=\s*(["']).*?\1/i.test(rootTag)) {
    updatedRootTag = rootTag.replace(/(\bversion\s*=\s*)(["']).*?\2/i, '$1"2.0"');
  } else {
    updatedRootTag = rootTag.replace(/>$/, ' version="2.0">');
  }
  return xml.replace(rootTag, updatedRootTag);
}

function prepareInvitationXml(invitationXml: string, clubXml: string): string {
  let xml = invitationXml.replace(/^\uFEFF/, '').trim();
  xml = xml.replace(/^\s*<\?xml[^?]*\?>\s*/i, '');
  if (!/<LENEX\b/i.test(xml) || !/<MEETS\b/i.test(xml)) {
    throw new EntryFileGenerationError('Invitation is missing LENEX/MEETS elements');
  }
  if (/<CLUBS\b/i.test(xml)) {
    throw new EntryFileGenerationError('Invitation already contains CLUBS');
  }

  xml = xml.replace(
    /(?:\r?\n)?[ \t]*<CONSTRUCTOR\b[^>]*\/\s*>|(?:\r?\n)?[ \t]*<CONSTRUCTOR\b[^>]*>[\s\S]*?<\/CONSTRUCTOR\s*>/gi,
    '',
  );
  xml = setLenexVersion(xml);
  const meetsClose = /<\/MEETS\s*>/i;
  if (!meetsClose.test(xml)) {
    throw new EntryFileGenerationError('Invitation is missing the closing MEETS element');
  }
  xml = xml.replace(meetsClose, (closingTag) =>
    `${closingTag}\r\n${clubXml}\r\n  <CONSTRUCTOR name="Lenex Entries" version="0.1.0" />`,
  );

  const xmlDeclaration = '<?xml version="1.0" encoding="Windows-1250"?>';
  return `${xmlDeclaration}\r\n${xml.replace(/\r?\n/g, '\r\n')}`;
}

function replaceUnrepresentableCharacters(xml: string): string {
  let result = '';
  for (const character of xml) {
    result += decodeWindows1250(encodeWindows1250(character)) === character
      ? character
      : `&#${character.codePointAt(0)};`;
  }
  return result;
}

export function buildEntryFile(meet: Meet, draft: EntryFileDraft): Uint8Array {
  validateDraft(meet, draft);
  const clubXml = renderClub(draft);
  const outputXml = replaceUnrepresentableCharacters(prepareInvitationXml(meet.rawXml, clubXml));
  return writeLxf('entry.lef', encodeWindows1250(outputXml));
}
