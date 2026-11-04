import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ageAt,
  buildEntryFile,
  collectImportedHistory,
  identityKey,
  parseInvitation,
  parseEntryFile,
  parseLenexDocument,
  parseResults,
  readLxf,
  resolveEvent,
} from '../src/index';

describe('real LENEX sample fixtures', () => {
  const samplesDir = path.resolve(__dirname, '../../../private/samples');

  it('parses the manifest invitation and reproduces event counts', () => {
    const invitationPath = path.join(samplesDir, 'KPP OLECKO', 'KPP OLECKO.lef');

    if (!existsSync(invitationPath)) {
      return;
    }

    const xml = readFileSync(invitationPath, 'utf8');
    const meet = parseInvitation(xml);

    expect(meet.maxEntriesPerAthlete).toBe(4);
    expect(meet.events.length).toBe(39);
    expect(new Set(meet.events.map((event) => event.disciplineKey)).size).toBe(12);
    expect(meet.events.some((event) => event.disciplineKey === '100m SF')).toBe(true);
  });

  it('parses the results file and counts athletes', () => {
    const resultsPath = path.join(samplesDir, 'results', 'results.lef');

    if (!existsSync(resultsPath)) {
      return;
    }

    const xml = readFileSync(resultsPath, 'utf8');
    const results = parseResults(xml);

    expect(results.athletes.length).toBe(165);
    expect(results.validResults.length).toBeGreaterThan(0);
  });

  it('joins real results styles to the matching previous entry without persisting personal data', () => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const resultsPath = path.join(workspaceRoot, 'results-Olecko.lxf');
    const previousEntryPath = path.join(workspaceRoot, 'KPP OLECKO.lxf');

    if (!existsSync(resultsPath) || !existsSync(previousEntryPath)) {
      return;
    }

    const resultsDocument = parseLenexDocument(readLxf(new Uint8Array(readFileSync(resultsPath))).xml);
    const previousEntryDocument = parseLenexDocument(
      readLxf(new Uint8Array(readFileSync(previousEntryPath))).xml,
    );

    expect(resultsDocument.kind).toBe('results');
    expect(previousEntryDocument.kind).toBe('entry');
    if (resultsDocument.kind !== 'results') {
      throw new Error('Expected the results fixture to be classified as results');
    }
    const history = collectImportedHistory([previousEntryDocument, resultsDocument], [
      path.basename(previousEntryPath),
      path.basename(resultsPath),
    ]);

    expect(history.athletes).toHaveLength(165);
    expect(
      history.observations.filter((observation) => observation.source.kind === 'result'),
    ).toHaveLength(resultsDocument.results.validResults.length);
    expect(history.unresolvedResultCount).toBe(0);
  });

  it('resolves unnamed real result styles through the invitation from the same meet', () => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const invitationPath = path.join(workspaceRoot, 'zaproszenia', 'zaproszenie (1).lxf');
    const resultsPath = path.join(workspaceRoot, 'wyniki', 'results (1).lxf');
    if (!existsSync(invitationPath) || !existsSync(resultsPath)) {
      return;
    }

    const invitation = parseLenexDocument(readLxf(new Uint8Array(readFileSync(invitationPath))).xml);
    const results = parseLenexDocument(readLxf(new Uint8Array(readFileSync(resultsPath))).xml);
    expect(invitation.kind).toBe('invitation');
    expect(results.kind).toBe('results');
    if (invitation.kind !== 'invitation' || results.kind !== 'results') {
      return;
    }

    const history = collectImportedHistory([invitation, results]);
    expect(history.unresolvedResultCount).toBe(0);
    expect(history.observations.filter((observation) => observation.source.kind === 'result'))
      .toHaveLength(results.results.validResults.length);
    expect(results.results.ignoredAthleteCount).toBe(1);
  });

  it('compares an Olecko-generated entry with the ready file without persisting personal data', () => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const invitationPath = path.join(workspaceRoot, 'zaproszenie-Olecko.lxf');
    const readyEntryPath = path.join(workspaceRoot, 'KPP OLECKO.lxf');
    if (!existsSync(invitationPath) || !existsSync(readyEntryPath)) {
      return;
    }

    const invitationXml = readLxf(new Uint8Array(readFileSync(invitationPath))).xml;
    const readyEntryXml = readLxf(new Uint8Array(readFileSync(readyEntryPath))).xml;
    const meet = parseInvitation(invitationXml);
    const readyEntry = parseEntryFile(readyEntryXml);
    expect(readyEntry.clubs).toHaveLength(1);
    const sourceClub = readyEntry.clubs[0];

    const athletes = sourceClub.athletes.map((athlete) => ({
      firstName: athlete.firstName,
      lastName: athlete.lastName,
      birthYear: athlete.birthYear,
      gender: athlete.gender,
      entries: athlete.entries.map((entry) => {
        const event = resolveEvent(
          meet,
          athlete.gender,
          entry.disciplineKey,
          ageAt(meet, athlete.birthYear),
        );
        if (!event || entry.timeCs === null) {
          throw new Error('Olecko event schedule cannot reproduce a ready-file entry');
        }
        return { eventId: event.eventId, timeCs: entry.timeCs };
      }),
    }));
    const relays = sourceClub.relays.map((relay) => {
      const event = meet.events.find(
        (candidate) =>
          candidate.sessionNumber === relay.sessionNumber &&
          candidate.number === relay.eventNumber &&
          candidate.gender === relay.gender &&
          candidate.relayCount > 1,
      );
      if (!event || relay.timeCs === null) {
        throw new Error('Olecko event schedule cannot reproduce a ready-file relay');
      }
      return {
        eventId: event.eventId,
        number: relay.number,
        name: relay.name,
        gender: relay.gender,
        timeCs: relay.timeCs,
        ...(relay.ageMin !== undefined ? { ageMin: relay.ageMin } : {}),
        ...(relay.ageMax !== undefined ? { ageMax: relay.ageMax } : {}),
      };
    });

    const generatedXml = readLxf(
      buildEntryFile(meet, {
        club: { name: sourceClub.name, contact: sourceClub.contact },
        athletes,
        relays,
      }),
    ).xml;
    const generated = parseEntryFile(generatedXml);
    const sourceRecords = sourceClub.athletes.flatMap((athlete) =>
      athlete.entries.map((entry) => ({
        athlete: identityKey(athlete),
        discipline: entry.disciplineKey,
        timeCs: entry.timeCs,
      })),
    ).sort((left, right) =>
      left.athlete.localeCompare(right.athlete) ||
      left.discipline.localeCompare(right.discipline) ||
      (left.timeCs ?? -1) - (right.timeCs ?? -1),
    );
    const generatedRecords = generated.clubs.flatMap((club) =>
      club.athletes.flatMap((athlete) =>
        athlete.entries.map((entry) => ({
          athlete: identityKey(athlete),
          discipline: entry.disciplineKey,
          timeCs: entry.timeCs,
        })),
      ),
    ).sort((left, right) =>
      left.athlete.localeCompare(right.athlete) ||
      left.discipline.localeCompare(right.discipline) ||
      (left.timeCs ?? -1) - (right.timeCs ?? -1),
    );

    expect(generated.meet.events).toEqual(meet.events);
    expect(generated.clubs[0].name).toBe(sourceClub.name);
    expect(generated.clubs[0].contact).toEqual(sourceClub.contact);
    expect(generated.clubs[0].athletes).toHaveLength(sourceClub.athletes.length);
    expect(generated.clubs[0].relays).toHaveLength(sourceClub.relays.length);
    const relayRecordsMatch = sourceClub.relays.every((sourceRelay) =>
      generated.clubs[0].relays.some((generatedRelay) =>
        generatedRelay.sessionNumber === sourceRelay.sessionNumber &&
        generatedRelay.eventNumber === sourceRelay.eventNumber &&
        generatedRelay.gender === sourceRelay.gender &&
        generatedRelay.number === sourceRelay.number &&
        generatedRelay.name === sourceRelay.name &&
        generatedRelay.timeCs === sourceRelay.timeCs &&
        generatedRelay.ageMin === sourceRelay.ageMin &&
        generatedRelay.ageMax === sourceRelay.ageMax,
      ),
    );
    expect(relayRecordsMatch).toBe(true);
    expect(generatedRecords).toEqual(sourceRecords);
  });

  it('audits the new Olecko invitation metadata without exposing fixture records', () => {
    const workspaceRoot = path.resolve(__dirname, '../../..');
    const invitationPath = path.join(workspaceRoot, 'zaproszenie-Olecko.lxf');
    if (!existsSync(invitationPath)) {
      return;
    }

    const xml = readLxf(new Uint8Array(readFileSync(invitationPath))).xml;
    const meet = parseInvitation(xml);
    const entryAge = ageAt(meet, 2012);

    expect(meet.events).toHaveLength(39);
    expect(new Set(meet.events.map((event) => event.disciplineKey)).size).toBe(12);
    expect(meet.events.some((event) => event.gender === 'X' && event.relayCount === 4)).toBe(true);
    expect(entryAge).toBe(14);
  });
});
