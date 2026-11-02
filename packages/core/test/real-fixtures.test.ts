import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseInvitation, parseResults } from '../src/index';

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
});
