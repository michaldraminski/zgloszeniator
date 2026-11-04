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
  getRelayMemberOptions,
  getRelayAgeWarnings,
  getClubMismatch,
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
              <SWIMSTYLE name="50m SF" distance="50" relaycount="1" />
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
    <RELAYS><RELAY gender="X" number="2" name="Example relay" agemin="-1" agemax="-1" relayid="local-1">
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
        eventNumber: 2,
        sessionNumber: 1,
        disciplineKey: '4x50m SF',
        ageMin: -1,
        ageMax: -1,
        timeCs: 12100,
      }],
    });
  });

  it('parses optional relay positions by local athlete ID', () => {
    const xmlWithPosition = entryXml
      .replace('firstname="Swimmer" birthdate=', 'firstname="Swimmer" athleteid="1" birthdate=')
      .replace(
        /<\/ENTRIES>\s*<\/RELAY>/,
        '</ENTRIES><RELAYPOSITIONS><RELAYPOSITION number="1" athleteid="1" /></RELAYPOSITIONS></RELAY>',
      );
    const parsed = parseEntryFile(xmlWithPosition);

    expect(parsed.clubs[0].relays[0].members).toEqual([
      {
        position: 1,
        athlete: { firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' },
      },
    ]);
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

  it('skips result athletes with incomplete identity and reports how many were ignored', () => {
    const xmlWithAnonymousAthlete = resultsXml.replace(
      '</ATHLETES>',
      '<ATHLETE lastname="Unidentified" birthdate="2012-01-01" gender="F"><RESULTS>' +
        '<RESULT eventid="event-1" swimtime="00:00:28.00" /></RESULTS></ATHLETE></ATHLETES>',
    );
    const parsed = parseResults(xmlWithAnonymousAthlete);

    expect(parsed.athletes).toHaveLength(1);
    expect(parsed.ignoredAthleteCount).toBe(1);
    expect(parsed.validResults).toHaveLength(1);
    expect(parsed.validResults[0].timeCs).toBe(3080);
  });

  it('keeps same-name athletes distinct when their birth years differ across clubs', () => {
    const sameNameResultsXml = `<?xml version="1.0"?>
<LENEX version="3.0"><MEETS><MEET name="Synthetic Meet" course="SCM">
  <SESSIONS><SESSION number="1"><EVENTS>
    <EVENT eventid="event-1" number="1" gender="M"><SWIMSTYLE name="50m Freestyle" /></EVENT>
  </EVENTS></SESSION></SESSIONS>
</MEET></MEETS><CLUBS>
  <CLUB name="Synthetic Club One"><ATHLETES>
    <ATHLETE firstname="Alex" lastname="Example" birthdate="2012-01-01" gender="M">
      <RESULTS><RESULT eventid="event-1" swimtime="00:00:30.00" /></RESULTS>
    </ATHLETE>
  </ATHLETES></CLUB>
  <CLUB name="Synthetic Club Two"><ATHLETES>
    <ATHLETE firstname="Alex" lastname="Example" birthdate="2008-01-01" gender="M">
      <RESULTS><RESULT eventid="event-1" swimtime="00:00:25.00" /></RESULTS>
    </ATHLETE>
  </ATHLETES></CLUB>
</CLUBS></LENEX>`;
    const history = collectImportedHistory([parseLenexDocument(sameNameResultsXml)]);
    const youngerKey = identityKey({ firstName: 'Alex', lastName: 'Example', birthYear: 2012, gender: 'M' });
    const olderKey = identityKey({ firstName: 'Alex', lastName: 'Example', birthYear: 2008, gender: 'M' });

    expect(history.athletes).toHaveLength(2);
    expect(history.clubNamesByAthleteKey.get(youngerKey)).toEqual(['Synthetic Club One']);
    expect(history.clubNamesByAthleteKey.get(olderKey)).toEqual(['Synthetic Club Two']);
    expect(history.observations.map((observation) => observation.athleteKey).sort()).toEqual(
      [olderKey, youngerKey].sort(),
    );
  });

  it('parses results whose SWIMSTYLE has no name and keeps an unresolved event marker', () => {
    const unnamedStyleResults = resultsXml.replace(
      '<SWIMSTYLE name="50m SF" />',
      '<SWIMSTYLE distance="50" relaycount="0" stroke="UNKNOWN" />',
    );
    const parsed = parseResults(unnamedStyleResults);

    expect(parsed.validResults).toHaveLength(1);
    expect(parsed.validResults[0].disciplineKey).toBeUndefined();
    expect(parsed.validResults[0].eventId).toBe('event-1');
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

  it('parses unnamed result styles and resolves them through a matching previous entry', () => {
    const previousMeetXml = entryXml
      .replace('name="Synthetic Meet" course="SCM"', 'name="Olecko Meet" city="Olecko" course="SCM"');
    const resultsWithoutStyleNames = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Olecko Meet" city="Olecko" course="SCM" status="OFFICIAL"')
      .replace('name="50m SF"', 'distance="50" stroke="SURFACE"');
    const previousEntry = parseLenexDocument(previousMeetXml);
    const results = parseLenexDocument(resultsWithoutStyleNames);

    expect(results.kind).toBe('results');
    if (results.kind !== 'results') {
      return;
    }
    expect(results.results.athletes).toHaveLength(1);
    expect(results.results.validResults).toHaveLength(1);
    expect(results.results.validResults[0].disciplineKey).toBeUndefined();

    const history = collectImportedHistory([previousEntry, results]);
    expect(history.observations).toContainEqual(
      expect.objectContaining({
        disciplineKey: '50m SF',
        timeCs: 3080,
        source: expect.objectContaining({ kind: 'result' }),
      }),
    );
    expect(history.unresolvedResultCount).toBe(0);

    const unrelatedEntry = parseLenexDocument(previousMeetXml.replace('city="Olecko"', 'city="Other City"'));
    const unresolvedHistory = collectImportedHistory([unrelatedEntry, results]);
    expect(unresolvedHistory.unresolvedResultCount).toBe(1);
    expect(unresolvedHistory.observations.some((observation) => observation.source.kind === 'result')).toBe(false);
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

  it('maps unnamed result disciplines from a complete, uniquely matching entry event list', () => {
    const previousMeetXml = entryXml.replace(
      'name="Synthetic Meet" course="SCM"',
      'name="Synthetic Entry Meet" city="Olecko" course="SCM"',
    );
    const unnamedResultsXml = resultsXml.replace(
      'name="Synthetic Meet" course="SCM" status="OFFICIAL"',
      'name="Synthetic Results Meet" city="Olecko" course="SCM" status="OFFICIAL"',
    ).replace(
      '<SWIMSTYLE name="50m SF" />',
      '<SWIMSTYLE distance="50" relaycount="0" stroke="UNKNOWN" />',
    ).replace(
      '</EVENTS></SESSION>',
      '<EVENT eventid="event-relay" number="2" gender="X"><SWIMSTYLE distance="50" relaycount="4" stroke="UNKNOWN" /></EVENT></EVENTS></SESSION>',
    );
    const history = collectImportedHistory([
      parseLenexDocument(previousMeetXml),
      parseLenexDocument(unnamedResultsXml),
    ]);
    const key = identityKey({ firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' });

    expect(history.observations).toContainEqual(
      expect.objectContaining({
        athleteKey: key,
        disciplineKey: '50m SF',
        timeCs: 3080,
        source: expect.objectContaining({ kind: 'result' }),
      }),
    );
    expect(history.unresolvedResultCount).toBe(0);

    const conflictingEntry = parseLenexDocument(
      previousMeetXml.replace('name="50m SF"', 'name="25m AP"'),
    );
    const ambiguousHistory = collectImportedHistory([
      parseLenexDocument(previousMeetXml),
      conflictingEntry,
      parseLenexDocument(unnamedResultsXml),
    ]);
    expect(ambiguousHistory.unresolvedResultCount).toBe(1);
    expect(
      ambiguousHistory.observations.some((observation) => observation.source.kind === 'result'),
    ).toBe(false);
  });

  it('resolves unnamed result disciplines from the invitation for the same meet', () => {
    const invitation = parseLenexDocument(invitationXml);
    const unnamedResultsXml = resultsXml.replace(
      '<SWIMSTYLE name="50m SF" />',
      '<SWIMSTYLE distance="50" relaycount="1" />',
    ).replace('name="Synthetic Meet"', 'name="  synthetic   meet  "');
    const results = parseLenexDocument(unnamedResultsXml);
    const history = collectImportedHistory([invitation, results]);

    expect(history.unresolvedResultCount).toBe(0);
    expect(history.observations.filter((observation) => observation.source.kind === 'result')).toContainEqual(
      expect.objectContaining({ disciplineKey: '50m SF', timeCs: 3080 }),
    );
  });

  it('keeps results unresolved when the invitation belongs to another meet', () => {
    const partialResultsXml = resultsXml
      .replace('name="Synthetic Meet"', 'name="Different Meet"')
      .replaceAll('event-1', 'result-event-9')
      .replace('<SWIMSTYLE name="50m SF" />', '<SWIMSTYLE distance="50" relaycount="0" />');
    const results = parseLenexDocument(partialResultsXml);
    const history = collectImportedHistory([parseLenexDocument(invitationXml), results]);

    expect(history.unresolvedResultCount).toBe(1);
    expect(history.observations.filter((observation) => observation.source.kind === 'result')).toEqual([]);

    const invitationOnDifferentCourse = parseLenexDocument(
      invitationXml.replace('course="SCM"', 'course="LCM"'),
    );
    const sameNameResults = parseLenexDocument(
      resultsXml
        .replace('<SWIMSTYLE name="50m SF" />', '<SWIMSTYLE distance="50" relaycount="1" />'),
    );
    const differentCourseHistory = collectImportedHistory([
      invitationOnDifferentCourse,
      sameNameResults,
    ]);
    expect(differentCourseHistory.unresolvedResultCount).toBe(1);
  });

  it('leaves unnamed results unresolved when the event signature is duplicated', () => {
    const duplicatedScheduleXml = resultsXml
      .replace('name="Synthetic Meet"', 'name="Different Meet"')
      .replace('<SWIMSTYLE name="50m SF" />', '<SWIMSTYLE distance="50" relaycount="0" />')
      .replace(
        '</EVENTS></SESSION>',
        '<EVENT eventid="duplicate-event" number="1" gender="F"><SWIMSTYLE distance="50" relaycount="0" /></EVENT></EVENTS></SESSION>',
      );
    const history = collectImportedHistory([
      parseLenexDocument(entryXml),
      parseLenexDocument(duplicatedScheduleXml),
    ]);

    expect(history.unresolvedResultCount).toBe(1);
    expect(history.observations.filter((observation) => observation.source.kind === 'result')).toEqual([]);
  });

  it('prefers the best result from the previous 12 months, then falls back to the latest entry', () => {
    const previousEntryXml = entryXml
      .replace('name="Synthetic Meet" course="SCM"', 'name="Synthetic Meet" course="SCM" date="2026-11-01"');
    const bestResultXml = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Synthetic Meet" course="SCM" date="2026-10-01" status="OFFICIAL"')
      .replace('swimtime="00:00:30.80"', 'swimtime="00:00:20.00"');
    const newestResultXml = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Synthetic Meet" course="SCM" date="2026-10-20" status="OFFICIAL"')
      .replace('swimtime="00:00:30.80"', 'swimtime="00:00:29.50"');
    const outOfWindowResultXml = resultsXml
      .replace('name="Synthetic Meet" course="SCM" status="OFFICIAL"', 'name="Synthetic Meet" course="SCM" date="2025-10-19" status="OFFICIAL"')
      .replace('swimtime="00:00:30.80"', 'swimtime="00:00:10.00"');
    const key = identityKey({ firstName: 'Swimmer', lastName: 'Example', birthYear: 2012, gender: 'F' });
    const undatedResultHistory = collectImportedHistory([
      parseLenexDocument(entryXml),
      parseLenexDocument(resultsXml),
    ]);
    expect(suggestImportedTime(undatedResultHistory, key, '50m SF', 'SCM', '2026-10-25')).toMatchObject({
      timeCs: 3080,
      source: { kind: 'result' },
    });

    const history = collectImportedHistory([
      parseLenexDocument(previousEntryXml),
      parseLenexDocument(bestResultXml),
      parseLenexDocument(newestResultXml),
      parseLenexDocument(outOfWindowResultXml),
    ]);

    expect(suggestImportedTime(history, key, '50m SF', 'SCM', '2026-10-25')).toMatchObject({
      timeCs: 2000,
      source: { kind: 'result', meetDate: '2026-10-01' },
    });

    const entryFallbackHistory = collectImportedHistory([
      parseLenexDocument(entryXml),
      parseLenexDocument(outOfWindowResultXml),
    ]);
    expect(suggestImportedTime(entryFallbackHistory, key, '50m SF', 'SCM', '2026-10-25')).toMatchObject({
      timeCs: 3125,
      source: { kind: 'entry' },
    });
  });

  it('warns only when known historical club names do not match the selected club', () => {
    expect(getClubMismatch(['  Synthetic   Club '], 'synthetic club')).toEqual([]);
    expect(getClubMismatch(['Synthetic Club', 'Synthetic C.'], 'Other Club')).toEqual([
      'Synthetic Club',
      'Synthetic C.',
    ]);
    expect(getClubMismatch(['Synthetic Club'], '')).toEqual([]);
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
    expect(buildAthleteEventOptions(meet, history, new Set(['not-an-athlete']))).toEqual([]);
    expect(resolveEvent(meet, 'F', '50m SF', 14)?.eventId).toBe('event-1');
    expect(resolveEvent(meet, 'F', '50m SF', 30)).toBeUndefined();
  });

  it('resolves individual events only for the athlete gender', () => {
    const meet = parseInvitation(invitationXml);
    const maleMeet = {
      ...meet,
      events: meet.events.map((event) =>
        event.eventId === 'event-1' ? { ...event, gender: 'M' as const } : event,
      ),
    };

    expect(resolveEvent(meet, 'F', '50m SF', 14)?.eventId).toBe('event-1');
    expect(resolveEvent(meet, 'M', '50m SF', 14)).toBeUndefined();
    expect(resolveEvent(maleMeet, 'M', '50m SF', 14)?.eventId).toBe('event-1');
    expect(resolveEvent(maleMeet, 'F', '50m SF', 14)).toBeUndefined();
  });

  it('calculates competition age from the invitation age date rather than the current year', () => {
    const meet2026 = parseInvitation(invitationXml);
    const meet2027 = parseInvitation(
      invitationXml.replace('value="2026-10-25"', 'value="2027-10-25"'),
    );

    expect(ageAt(meet2026, 2012)).toBe(14);
    expect(ageAt(meet2027, 2012)).toBe(15);
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

  it('sorts imported athletes by surname then first name', () => {
    const xml = resultsXml.replace(
      '</ATHLETES>',
      '<ATHLETE firstname="Ala" lastname="Nowak" birthdate="2011-01-01" gender="F" />' +
        '<ATHLETE firstname="Adam" lastname="Adamski" birthdate="2010-01-01" gender="M" />' +
        '</ATHLETES>',
    );
    const history = collectImportedHistory([parseLenexDocument(xml)]);

    expect(history.athletes.map((athlete) => athlete.lastName)).toEqual([
      'Adamski',
      'Example',
      'Nowak',
    ]);
  });

  it('offers relay members only from the selected submission roster and matching gender', () => {
    const female = { firstName: 'Ada', lastName: 'Example', birthYear: 2012, gender: 'F' as const };
    const male = { firstName: 'Alex', lastName: 'Example', birthYear: 2012, gender: 'M' as const };
    const selected = new Set([identityKey(female), identityKey(male)]);
    const roster = [female, male, { ...female, firstName: 'Unselected' }];

    expect(getRelayMemberOptions(roster, selected, 'F')).toEqual([female]);
    expect(getRelayMemberOptions(roster, selected, 'X')).toEqual([female, male]);
  });

  it('warns for adults in junior relays and members above a stated category limit', () => {
    const meet = parseInvitation(invitationXml);
    const adult = { firstName: 'Alex', lastName: 'Example', birthYear: 2008, gender: 'M' as const };
    const juniorWarning = getRelayAgeWarnings(meet, 'KAT. Junior', undefined, [adult]);
    expect(juniorWarning).toMatchObject([{ age: 18, reason: 'adult-in-junior' }]);

    const ageCapWarning = getRelayAgeWarnings(meet, 'KAT. Open', 17, [adult]);
    expect(ageCapWarning).toMatchObject([{ age: 18, reason: 'over-category-limit' }]);
    expect(getRelayAgeWarnings(meet, 'KAT. Junior', 17, [adult])).toMatchObject([
      { age: 18, reason: 'adult-in-junior-and-over-category-limit' },
    ]);
    expect(getRelayAgeWarnings(meet, 'KAT. Junior', undefined, [
      { ...adult, birthYear: 2010 },
    ])).toEqual([]);
  });
});