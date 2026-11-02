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

    const generatedXml = readLxf(
      buildEntryFile(meet, {
        club: { name: sourceClub.name, contact: sourceClub.contact },
        athletes,
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
