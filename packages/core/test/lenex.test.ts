import { describe, expect, it } from 'vitest';

import {
  parseEntryFile,
  parseInvitation,
  parseLenexDocument,
  parseResults,
  collectImportedHistory,
  identityKey,
  suggestImportedTime,
  ageAt,
  buildAthleteEventOptions,
  resolveEvent,
  UnsupportedAgeDateType,
} from '../src/index';

const invitationXml = `<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0">
  <MEETS>
    <MEET name="Synthetic Meet" course="SCM" deadline="2026-10-20">
      <AGEDATE type="YEAR" value="2026-10-25" />
      <SESSIONS>
        <SESSION number="1">
          <EVENTS>
            <EVENT eventid="event-1" number="1" order="1" gender="F">
              <SWIMSTYLE name="50m SF" distance="50" relaycount="0" />
              <AGEGROUPS><AGEGROUP name="Junior" agemin="12" agemax="15" /></AGEGROUPS>
            </EVENT>
            <EVENT eventid="event-relay" number="2" order="2" gender="X">
              <SWIMSTYLE name="4x50m SF" code="4x50m pp" distance="50" relaycount="4" />
              <AGEGROUPS><AGEGROUP name="Senior" agemin="-1" agemax="-1" /></AGEGROUPS>
            </EVENT>
          </EVENTS>
        </SESSION>
      </SESSIONS>
    </MEET>
  </MEETS>
</LENEX>`;

const entryXml = `<?xml version="1.0" encoding="Windows-1250"?>
<LENEX version="2.0">
  <MEETS>
    <MEET name="Synthetic Meet" course="SCM">
      <AGEDATE type="YEAR" value="2026-10-25" />
      <SESSIONS><SESSION number="1"><EVENTS>
        <EVENT eventid="event-1" number="1" gender="F"><SWIMSTYLE name="50m SF" /></EVENT>
        <EVENT eventid="event-relay" number="2" gender="X"><SWIMSTYLE name="4x50m SF" relaycount="4" /></EVENT>
      </EVENTS></SESSION></SESSIONS>
    </MEET>
  </MEETS>
  <CLUBS><CLUB name="Example Club">
    <CONTACT name="Coach Example" phone="000" email="coach@example.invalid" />
    <ATHLETES><ATHLETE lastname="Example" firstname="Swimmer" birthdate="2012-01-01" gender="F">
      <ENTRIES><ENTRY eventid="event-1" entrytime="00:00:31.25" /></ENTRIES>
    </ATHLETE></ATHLETES>
    <RELAYS><RELAY gender="X" number="2" name="Example relay" relayid="local-1">
      <ENTRIES><ENTRY eventid="event-relay" entrytime="00:02:01.00" /></ENTRIES>
    </RELAY></RELAYS>
  </CLUB></CLUBS>
  <CONSTRUCTOR name="Synthetic" />
</LENEX>`;

const resultsXml = `<?xml version="1.0" encoding="UTF-8"?>
<LENEX version="3.0"><MEETS><MEET name="Synthetic Meet" course="SCM" status="OFFICIAL">
  <SESSIONS><SESSION number="1"><EVENTS>
    <EVENT eventid="event-1" number="1" gender="F"><SWIMSTYLE name="50m SF" /></EVENT>
  </EVENTS></SESSION></SESSIONS>
  <CLUBS><CLUB name="Example Club"><ATHLETES>
    <ATHLETE firstname="Swimmer" lastname="Example" birthdate="2012-06-01" gender="F" athleteid="external-99">
      <RESULTS>
        <RESULT eventid="event-1" swimtime="00:00:30.80" />
        <RESULT eventid="event-1" swimtime="00:00:29.90" status="DSQ" />
      </RESULTS>
    </ATHLETE>
  </ATHLETES></CLUB></CLUBS>
</MEET></MEETS></LENEX>`;

describe('LENEX parsers', () => {
  it('parses invitation event metadata without trusting SWIMSTYLE distance', () => {
    const meet = parseInvitation(invitationXml);

    expect(meet.name).toBe('Synthetic Meet');
    expect(meet.course).toBe('SCM');
    expect(meet.events).toHaveLength(2);
    expect(meet.events[0]).toMatchObject({
      eventId: 'event-1',
      sessionNumber: 1,
      gender: 'F',
      disciplineKey: '50m SF',
      ageGroups: [{ name: 'Junior', min: 12, max: 15 }],
    });
    expect(meet.events[1].disciplineKey).toBe('4x50m SF');
  });

  it('parses entries using event references and keeps relay entries separate', () => {
    const parsed = parseEntryFile(entryXml);

    expect(parsed.clubs).toHaveLength(1);
    expect(parsed.clubs[0]).toMatchObject({
      name: 'Example Club',
      athletes: [{
        firstName: 'Swimmer',
        lastName: 'Example',
        birthYear: 2012,
        gender: 'F',
        entries: [{ eventId: 'event-1', disciplineKey: '50m SF', timeCs: 3125 }],
      }],
      relays: [{
        eventId: 'event-relay',
        disciplineKey: '4x50m SF',
        timeCs: 12100,
      }],
    });
  });

  it('finds previous-entry CLUBS nested under MEET', () => {
    const xml = `<?xml version="1.0"?>
<LENEX version="2.0"><MEETS><MEET name="Nested Meet" course="SCM">
  <AGEDATE type="YEAR" value="2026-10-25" />
  <SESSIONS><SESSION number="1"><EVENTS>
    <EVENT eventid="nested-event" number="1" gender="F"><SWIMSTYLE name="50m SF" /></EVENT>
  </EVENTS></SESSION></SESSIONS>
  <CLUBS><CLUB name="Synthetic Club"><ATHLETES>
    <ATHLETE firstname="Example" lastname="Swimmer" birthdate="2012-01-01" gender="F">
      <ENTRIES><ENTRY eventid="nested-event" entrytime="00:00:31.25" /></ENTRIES>
    </ATHLETE>
  </ATHLETES></CLUB></CLUBS>
</MEET></MEETS></LENEX>`;

    expect(parseEntryFile(xml).clubs[0].athletes).toHaveLength(1);
  });

  it('uses birth year identity and returns only valid result observations', () => {
    const parsed = parseResults(resultsXml);

    expect(parsed.athletes).toEqual([
      { firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' },
    ]);
    expect(parsed.validResults).toEqual([
      expect.objectContaining({
        athlete: { firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' },
        disciplineKey: '50m SF',
        course: 'SCM',
        timeCs: 3080,
      }),
    ]);
  });

  it('finds result CLUBS as a sibling of MEETS', () => {
    const xml = `<?xml version="1.0"?>
<LENEX version="3.0"><MEETS><MEET name="Root Clubs Meet" course="SCM">
  <SESSIONS><SESSION number="1"><EVENTS>
    <EVENT eventid="root-event" number="1" gender="F"><SWIMSTYLE name="50m SF" /></EVENT>
  </EVENTS></SESSION></SESSIONS>
</MEET></MEETS><CLUBS><CLUB name="Synthetic Club"><ATHLETES>
  <ATHLETE firstname="Example" lastname="Swimmer" birthdate="2012-01-01" gender="F">
    <RESULTS><RESULT eventid="root-event" swimtime="00:00:30.80" /></RESULTS>
  </ATHLETE>
</ATHLETES></CLUB></CLUBS></LENEX>`;

    const parsed = parseResults(xml);
    expect(parsed.athletes).toHaveLength(1);
    expect(parsed.validResults).toHaveLength(1);
  });

  it('rejects malformed or unsupported invitation structures', () => {
    expect(() => parseInvitation('<LENEX><MEETS /></LENEX>')).toThrow();
    expect(() => parseInvitation(invitationXml.replace('type="YEAR"', 'type="AGE"'))).toThrow(
      'Unsupported AGEDATE type: AGE',
    );
  });

  it('dispatches each document to its parser based on content', () => {
    expect(parseLenexDocument(invitationXml).kind).toBe('invitation');
    expect(parseLenexDocument(entryXml).kind).toBe('entry');
    expect(parseLenexDocument(resultsXml).kind).toBe('results');
  });
  
  it('combines prior entries and results by normalized athlete identity', () => {
    const history = collectImportedHistory([
      parseLenexDocument(entryXml),
      parseLenexDocument(resultsXml),
      parseLenexDocument(invitationXml),
    ]);

    expect(history.athletes).toHaveLength(1);
    expect(history.observations).toHaveLength(2);
    expect(history.observations.map((observation) => observation.source.kind).sort()).toEqual([
      'entry',
      'result',
    ]);
    expect(history.observations.map((observation) => observation.timeCs)).toEqual([3125, 3080]);
  });

  it('prefers the newest result, then falls back to the latest previous entry', () => {
    const previousEntryXml = entryXml
      .replace('name="Synthetic Meet" course="SCM"', 'name="Synthetic Meet" course="SCM" date="2026-11-01"');
    const olderResultXml = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Synthetic Meet" course="SCM" date="2026-10-01" status="OFFICIAL"')
      .replace('swimtime="00:00:30.80"', 'swimtime="00:00:20.00"');
    const newestResultXml = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Synthetic Meet" course="SCM" date="2026-10-20" status="OFFICIAL"')
      .replace('swimtime="00:00:30.80"', 'swimtime="00:00:29.50"');
    const history = collectImportedHistory([
      parseLenexDocument(previousEntryXml),
      parseLenexDocument(olderResultXml),
      parseLenexDocument(newestResultXml),
    ]);
    const key = identityKey({ firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' });

    expect(suggestImportedTime(history, key, '50m SF', 'SCM')).toMatchObject({
      timeCs: 2950,
      source: { kind: 'result', meetDate: '2026-10-20' },
    });

    const entryOnlyHistory = collectImportedHistory([parseLenexDocument(entryXml)]);
    expect(suggestImportedTime(entryOnlyHistory, key, '50m SF', 'SCM')).toMatchObject({
      timeCs: 3125,
      source: { kind: 'entry' },
    });
  });

  it('builds age-eligible individual event choices with suggested history times', () => {
    const meet = parseInvitation(invitationXml);
    const history = collectImportedHistory([
      parseLenexDocument(entryXml),
      parseLenexDocument(resultsXml),
    ]);
    const options = buildAthleteEventOptions(meet, history);

    expect(ageAt(meet, 2012)).toBe(14);
    expect(options).toHaveLength(1);
    expect(options[0].events).toHaveLength(1);
    expect(options[0].events[0]).toMatchObject({
      event: { eventId: 'event-1', disciplineKey: '50m SF' },
      suggestedTime: {
        timeCs: 3080,
        source: { kind: 'result' },
      },
    });
    expect(resolveEvent(meet, 'F', '50m SF', 14)?.eventId).toBe('event-1');
    expect(resolveEvent(meet, 'F', '50m SF', 30)).toBeUndefined();
  });

  it('rejects unsupported age-date types when resolving athlete eligibility', () => {
    const meet = { ...parseInvitation(invitationXml), ageDate: { type: 'AGE', value: '2026' } };

    expect(() => ageAt(meet, 2012)).toThrow(UnsupportedAgeDateType);
  });

  it('normalizes athlete identity with Unicode NFC, whitespace, and case folding', () => {
    expect(
      identityKey({ firstName: 'Éva', lastName: 'Kowalska', birthYear: 2012, gender: 'F' }),
    ).toBe(
      identityKey({ firstName: '  ÉVA ', lastName: 'KOWALSKA', birthYear: 2012, gender: 'F' }),
    );
  });
});