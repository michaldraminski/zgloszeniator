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

  it('rejects invalid times, unknown events, and duplicate athlete identities', () => {
    const meet = parseInvitation(invitationXml);
    expect(() => buildEntryFile(meet, {
      ...sampleDraft,
      athletes: [{ ...sampleDraft.athletes[0], entries: [{ eventId: 'synthetic-event-1', timeCs: -1 }] }],
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
});