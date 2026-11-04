import { describe, expect, it } from 'vitest';

import { addUniqueHistoricalFiles } from '../src/file-import';

const invitation = {
  kind: 'invitation' as const,
  meet: {
    key: 'synthetic-meet',
    name: 'Synthetic Meet',
    course: 'SCM' as const,
    ageDate: { type: 'YEAR', value: '2026' },
    events: [],
    rawXml: '<LENEX />',
  },
};

const results = {
  kind: 'results' as const,
  results: {
    meet: invitation.meet,
    athletes: [],
    athleteClubs: [],
    validResults: [],
  },
};

describe('addUniqueHistoricalFiles', () => {
  it('merges successive imports and does not add the same parsed document twice', () => {
    const result = addUniqueHistoricalFiles(
      [{ fileName: 'results.lef', document: results }],
      [
        { fileName: 'results (copy).lxf', document: results },
        { fileName: 'same file renamed.lxf', document: invitation },
      ],
    );

    expect(result.files.map(({ fileName }) => fileName).sort()).toEqual([
      'results.lef',
      'same file renamed.lxf',
    ]);
    expect(result.duplicateFileNames).toEqual(['results (copy).lxf']);
  });

  it('removes duplicates within one batch while preserving distinct documents', () => {
    const result = addUniqueHistoricalFiles([], [
      { fileName: 'invitation.lef', document: invitation },
      { fileName: 'invitation-copy.lxf', document: invitation },
      { fileName: 'results.lef', document: results },
    ]);

    expect(result.files.map(({ fileName }) => fileName).sort()).toEqual([
      'invitation.lef',
      'results.lef',
    ]);
    expect(result.duplicateFileNames).toEqual(['invitation-copy.lxf']);
  });
});
