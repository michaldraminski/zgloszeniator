import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  collectImportedHistory,
  parseInvitation,
  parseLenexDocument,
  parseResults,
  readLxf,
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
});
