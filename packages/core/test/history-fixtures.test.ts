import { readFileSync } from 'node:fs';
import path from 'node:path';

import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { collectImportedHistory, parseLenexDocument, readLxf } from '../src/index';

const syntheticDir = path.resolve(__dirname, '../../../fixtures/synthetic');

function readFixture(fileName: string) {
  return readFileSync(path.join(syntheticDir, fileName), 'utf8');
}

describe('synthetic import fixtures', () => {
  it('loads the required invitation and combines previous entry/results history', () => {
    const invitation = parseLenexDocument(readFixture('invitation.lef'));
    const previousEntry = parseLenexDocument(readFixture('previous-entry.lef'));
    const results = parseLenexDocument(readFixture('results.lef'));

    expect(invitation.kind).toBe('invitation');
    const history = collectImportedHistory([previousEntry, results]);
    expect(history.athletes).toHaveLength(1);
    expect(history.observations).toHaveLength(2);
    expect(history.observations.map((observation) => observation.timeCs)).toEqual([3125, 2990]);
  });

  it('reads and parses results from a ZIP-backed .lxf container', () => {
    const bytes = zipSync({ 'results.lef': new TextEncoder().encode(readFixture('results.lef')) });
    const { xml } = readLxf(bytes);

    expect(parseLenexDocument(xml).kind).toBe('results');
  });
});
