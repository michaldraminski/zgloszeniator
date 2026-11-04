import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildEntryFile,
  buildAthleteEventOptions,
  collectImportedHistory,
  identityKey,
  parseEntryFile,
  parseInvitation,
  parseLenexDocument,
  readLxf,
} from '../src/index';

const fixturePath = path.resolve(__dirname, '../../../fixtures/synthetic/invitation.lef');
const invitationXml = readFileSync(fixturePath, 'utf8');

const sampleDraft = {
  club: {
    name: 'Łódzki Klub & Przyjaciele',
    contact: { name: 'Trener Testowy', phone: '123', email: 'test@example.invalid' },
  },
  athletes: [
    {
      firstName: 'Ada',
      lastName: 'Przykładowa',
      birthYear: 2012,
      gender: 'F' as const,
      entries: [{ eventId: 'synthetic-event-1', timeCs: 3125 }],
    },
  ],
};

describe('buildEntryFile', () => {
  it('creates a LENEX 2.0 Windows-1250 .lxf and preserves the complete invitation', () => {
    const meet = parseInvitation(invitationXml);
    const archive = buildEntryFile(meet, sampleDraft);
    const { fileName, xml } = readLxf(archive);
    const parsed = parseEntryFile(xml);

    expect(fileName).toBe('entry.lef');
    expect(xml).toContain('<?xml version="1.0" encoding="Windows-1250"?>');
    expect(xml).toMatch(/<LENEX[^>]*version="2\.0"/);
    expect(xml).toContain('<AGEGROUP name="Synthetic Junior" agemin="12" agemax="15" />');
    expect(xml).toContain('<CONSTRUCTOR name="Lenex Entries"');
    expect(xml.indexOf('</MEETS>')).toBeLessThan(xml.indexOf('<CLUBS>'));
    expect(xml.indexOf('<CLUBS>')).toBeLessThan(xml.indexOf('<CONSTRUCTOR'));
    expect(parsed.clubs).toHaveLength(1);
    expect(parsed.clubs[0]).toMatchObject({
      name: sampleDraft.club.name,
      contact: sampleDraft.club.contact,
      athletes: [{
        firstName: 'Ada',
        lastName: 'Przykładowa',
        birthYear: 2012,
        gender: 'F',
        entries: [{ eventId: 'synthetic-event-1', timeCs: 3125 }],
      }],
    });
  });

  it('uses a generated submission as history for the next meet with different event IDs', () => {
    const firstMeet = parseInvitation(invitationXml);
    const firstSubmission = buildEntryFile(firstMeet, sampleDraft);
    const firstEntryDocument = parseLenexDocument(readLxf(firstSubmission).xml);
    const nextInvitationXml = invitationXml
      .replace('Synthetic Meet', 'Synthetic Next Meet')
      .replace('eventid="synthetic-event-1"', 'eventid="next-event-1"')
      .replace('eventid="synthetic-relay-event"', 'eventid="next-relay-event"');
    const nextMeet = parseInvitation(nextInvitationXml);

    expect(firstEntryDocument.kind).toBe('entry');
    if (firstEntryDocument.kind !== 'entry') {
      return;
    }

    const history = collectImportedHistory([firstEntryDocument]);
    const [athleteOptions] = buildAthleteEventOptions(nextMeet, history);
    expect(athleteOptions.events[0]).toMatchObject({
      event: { eventId: 'next-event-1', disciplineKey: '50m SF' },
      suggestedTime: { timeCs: 3125, source: { kind: 'entry' } },
    });

    const nextSubmission = buildEntryFile(nextMeet, {
      ...sampleDraft,
      athletes: [{
        ...sampleDraft.athletes[0],
        entries: [{
          eventId: athleteOptions.events[0].event.eventId,
          timeCs: athleteOptions.events[0].suggestedTime!.timeCs,
        }],
      }],
    });
    const parsedNextSubmission = parseEntryFile(readLxf(nextSubmission).xml);
    expect(parsedNextSubmission.clubs[0].athletes[0].entries).toEqual([
      { eventId: 'next-event-1', disciplineKey: '50m SF', timeCs: 3125 },
    ]);
  });

  it('escapes XML values and replaces unrepresentable characters with numeric references', () => {
    const meet = parseInvitation(invitationXml);
    const archive = buildEntryFile(meet, {
      ...sampleDraft,
      club: { ...sampleDraft.club, name: 'Club <A> & 😀' },
    });
    const { xml } = readLxf(archive);

    expect(xml).toContain('name="Club &lt;A&gt; &amp; &#128512;"');
    expect(parseEntryFile(xml).clubs[0].name).toBe('Club <A> & &#128512;');
  });

  it('replaces an invitation constructor instead of preserving the vendor identity', () => {
    const invitationWithConstructor = invitationXml.replace(
      '</LENEX>',
      '<CONSTRUCTOR name="Vendor Tool" /></LENEX>',
    );
    const archive = buildEntryFile(parseInvitation(invitationWithConstructor), sampleDraft);
    const { xml } = readLxf(archive);

    expect(xml.match(/<CONSTRUCTOR\b/g)).toHaveLength(1);
    expect(xml).toContain('<CONSTRUCTOR name="Lenex Entries" version="0.1.0" />');
    expect(xml).not.toContain('Vendor Tool');
  });

  it('rejects invalid times, unknown events, and duplicate athlete identities', () => {
    const meet = parseInvitation(invitationXml);
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{ ...sampleDraft.athletes[0], entries: [{ eventId: 'synthetic-event-1', timeCs: -1 }] }],
    })).toThrow('Invalid entry time');
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{
        ...sampleDraft.athletes[0],
        entries: [{ eventId: 'synthetic-event-1', timeCs: 100 * 60 * 60 * 100 }],
      }],
    })).toThrow('Invalid entry time');
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{ ...sampleDraft.athletes[0], entries: [{ eventId: 'missing-event', timeCs: 3125 }] }],
    })).toThrow('Unknown event');
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [sampleDraft.athletes[0], sampleDraft.athletes[0]],
    })).toThrow('Duplicate athlete');
  });

  it('rejects duplicate event IDs for one athlete', () => {
    const meet = parseInvitation(invitationXml);
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{
        ...sampleDraft.athletes[0],
        entries: [
          { eventId: 'synthetic-event-1', timeCs: 3125 },
          { eventId: 'synthetic-event-1', timeCs: 3100 },
        ],
      }],
    })).toThrow('Duplicate event for athlete');
  });

  it('exports a relay without relay members and keeps its selected age category', () => {
    const meet = parseInvitation(invitationXml);
    const archive = buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [],
      relays: [{
        eventId: 'synthetic-relay-event',
        number: 1,
        name: 'Synthetic Senior',
        gender: 'X',
        ageMin: -1,
        ageMax: -1,
        timeCs: 12100,
      }],
    });
    const { xml } = readLxf(archive);
    const parsed = parseEntryFile(xml);

    expect(xml).toContain('<RELAY gender="X" number="1" name="Synthetic Senior" agemin="-1" agemax="-1" relayid="1">');
    expect(parsed.clubs[0].athletes).toHaveLength(0);
    expect(parsed.clubs[0].relays).toMatchObject([{
      name: 'Synthetic Senior',
      gender: 'X',
      number: 1,
      eventId: 'synthetic-relay-event',
      disciplineKey: '4x50m SF',
      timeCs: 12100,
    }]);
    expect(xml).not.toContain('RELAYPOSITIONS');
  });

  it('rejects relay entries that reference an individual event or have an invalid time', () => {
    const meet = parseInvitation(invitationXml);
    const draft = {
      ...sampleDraft,
      athletes: [],
      relays: [{
        eventId: 'synthetic-event-1',
        number: 1,
        name: 'Synthetic Relay',
        gender: 'F' as const,
        timeCs: 12100,
      }],
    };

    expect(() => buildEntryFile(meet, draft)).toThrow('Unknown relay event');
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [],
      relays: [{ ...draft.relays[0], eventId: 'synthetic-relay-event', gender: 'X' as const, timeCs: -1 }],
    })).toThrow('Invalid relay time');
  });

  it('optionally adds relay members as athletes and writes ordered RELAYPOSITIONS', () => {
    const meet = parseInvitation(invitationXml);
    const athlete = sampleDraft.athletes[0];
    const archive = buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{ ...athlete, entries: [] }],
      relays: [{
        eventId: 'synthetic-relay-event',
        number: 1,
        name: 'Synthetic Senior',
        gender: 'X',
        ageMin: -1,
        ageMax: -1,
        timeCs: 12100,
        memberAthleteKeys: [identityKey(athlete)],
      }],
    });
    const { xml } = readLxf(archive);
    const parsed = parseEntryFile(xml);

    expect(xml).toContain('<RELAYPOSITIONS>');
    expect(xml).toContain('<RELAYPOSITION number="1" athleteid="1" />');
    expect(parsed.clubs[0].athletes).toHaveLength(1);
    expect(parsed.clubs[0].athletes[0].entries).toHaveLength(0);
    expect(parsed.clubs[0].relays[0].members).toEqual([
      {
        position: 1,
        athlete: { firstName: 'Ada', lastName: 'Przykładowa', birthYear: 2012, gender: 'F' },
      },
    ]);
  });

  it('rejects duplicate or excess relay member assignments', () => {
    const meet = parseInvitation(invitationXml);
    const athlete = sampleDraft.athletes[0];
    const baseRelay = {
      eventId: 'synthetic-relay-event',
      number: 1,
      name: 'Synthetic Senior',
      gender: 'X' as const,
      timeCs: 12100,
    };
    const draft = (memberAthleteKeys: string[]) => ({
      ...sampleDraft,
      athletes: [{ ...athlete, entries: [] }],
      relays: [{ ...baseRelay, memberAthleteKeys }],
    });

    expect(() => buildEntryFile(meet, draft([identityKey(athlete), identityKey(athlete)])))
      .toThrow('Relay athlete cannot occupy multiple positions');
    const relayOnlyAthletes = Array.from({ length: 5 }, (_, index) => ({
      ...athlete,
      firstName: `Swimmer ${index + 1}`,
      entries: [],
    }));
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: relayOnlyAthletes,
      relays: [{
        ...baseRelay,
        memberAthleteKeys: relayOnlyAthletes.map((candidate) => identityKey(candidate)),
      }],
    })).toThrow('Too many relay members');
  });

  it('can serialize selected relay members as optional ordered positions', () => {
    const meet = parseInvitation(invitationXml);
    const athlete = sampleDraft.athletes[0];
    const archive = buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{ ...athlete, entries: [] }],
      relays: [{
        eventId: 'synthetic-relay-event',
        number: 1,
        name: 'Synthetic Senior',
        gender: 'X',
        timeCs: 12100,
        memberAthleteKeys: [identityKey(athlete)],
      }],
    });
    const { xml } = readLxf(archive);
    const parsed = parseEntryFile(xml);

    expect(xml).toContain('<ATHLETE lastname="Przykładowa" firstname="Ada" birthdate="2012-01-01" gender="F" athleteid="1">');
    expect(xml).toContain('<RELAYPOSITION number="1" athleteid="1" />');
    expect(parsed.clubs[0].athletes[0].entries).toHaveLength(0);
    expect(parsed.clubs[0].relays[0].members).toEqual([
      {
        position: 1,
        athlete: { firstName: 'Ada', lastName: 'Przykładowa', birthYear: 2012, gender: 'F' },
      },
    ]);
  });

  it('rejects relay members with the wrong gender for a single-gender relay', () => {
      const meet = parseInvitation(invitationXml);
      const femaleRelayMeet = {
        ...meet,
        events: meet.events.map((event) =>
          event.eventId === 'synthetic-relay-event' ? { ...event, gender: 'M' as const } : event,
        ),
      };
      const athlete = sampleDraft.athletes[0];

      expect(() => buildEntryFile(femaleRelayMeet, {
        ...sampleDraft,
        athletes: [{ ...athlete, entries: [] }],
        relays: [{
          eventId: 'synthetic-relay-event',
          number: 1,
          name: 'Synthetic Relay',
          gender: 'M',
          timeCs: 12100,
          memberAthleteKeys: [identityKey(athlete)],
        }],
      })).toThrow('Relay member gender does not match the relay event');
    });

  it('keeps individual entries for athletes who are also assigned to relay positions', () => {
      const meet = parseInvitation(invitationXml);
      const athlete = sampleDraft.athletes[0];
      const archive = buildEntryFile(meet, {
        ...sampleDraft,
        athletes: [athlete],
        relays: [{
          eventId: 'synthetic-relay-event',
          number: 1,
          name: 'Synthetic Senior',
          gender: 'X',
          timeCs: 12100,
          memberAthleteKeys: [identityKey(athlete)],
        }],
      });
      const parsed = parseEntryFile(readLxf(archive).xml);

      expect(parsed.clubs[0].athletes[0].entries).toHaveLength(1);
      expect(parsed.clubs[0].relays[0].members[0].athlete.firstName).toBe('Ada');
    });
});