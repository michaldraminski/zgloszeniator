import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildEntryFile,
  parseEntryFile,
  parseInvitation,
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

  it('rejects relay entries that reference an individual event or duplicate relay numbers', () => {
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
      relays: [
        { ...draft.relays[0], eventId: 'synthetic-relay-event', gender: 'X' as const },
        { ...draft.relays[0], eventId: 'synthetic-relay-event', gender: 'X' as const },
      ],
    })).toThrow('Duplicate relay number');
  });
});