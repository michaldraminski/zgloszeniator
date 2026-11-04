import { describe, expect, it } from 'vitest';

import type { AppSnapshot } from '../src/db/app-snapshot';
import { BackupValidationError, parseAppBackup, serializeAppBackup } from '../src/db/app-backup';

const snapshot: AppSnapshot = {
  invitation: {
    fileName: 'synthetic-invitation.lef',
    meet: {
      key: 'synthetic-meet',
      name: 'Synthetic Meet',
      course: 'SCM',
      events: [{
        eventId: 'event-1',
        number: 1,
        sessionNumber: 1,
        gender: 'F',
        disciplineKey: '50m SF',
        relayCount: 0,
        ageGroups: [{ name: 'Synthetic Junior', min: 12, max: 15 }],
      }],
      rawXml: '<LENEX />',
    },
  },
  historicalFiles: [],
  localAthletes: [{ firstName: 'Synthetic', lastName: 'Athlete', birthYear: 2012, gender: 'F' }],
  clubDetails: { name: 'Synthetic Club', contactName: '', phone: '', email: '' },
  relayDrafts: [],
  selectedAthleteKeys: ['synthetic-athlete'],
  selectedEventIds: { 'synthetic-athlete': ['event-1'] },
  editedTimes: { 'synthetic-athlete': { 'event-1': '00:01:02.34' } },
};

describe('app backup validation', () => {
  it('round-trips persisted app state as versioned JSON', () => {
    const backup = serializeAppBackup(snapshot);

    expect(JSON.parse(backup)).toMatchObject({ format: 'lenex-entries-backup', version: 1 });
    expect(parseAppBackup(backup)).toEqual(snapshot);
  });

  it('rejects malformed or unsupported backups with a typed error', () => {
    expect(() => parseAppBackup('{')).toThrow(BackupValidationError);
    expect(() => parseAppBackup(JSON.stringify({ format: 'other', version: 2, snapshot })))
      .toThrow(BackupValidationError);
  });

  it('rejects invalid nested meet data before restoration', () => {
    const backup = JSON.parse(serializeAppBackup(snapshot)) as {
      format: string;
      version: number;
      snapshot: { invitation: { meet: { events: Array<{ relayCount: number }> } } };
    };
    backup.snapshot.invitation.meet.events[0].relayCount = 1.5;

    expect(() => parseAppBackup(JSON.stringify(backup))).toThrow(BackupValidationError);
  });

  it('restores older result backups without athlete-club metadata', () => {
    const legacyBackup = {
      format: 'lenex-entries-backup',
      version: 1,
      snapshot: {
        ...snapshot,
        historicalFiles: [{
          fileName: 'synthetic-results.lef',
          document: {
            kind: 'results',
            results: {
              meet: snapshot.invitation!.meet,
              athletes: [],
              validResults: [],
            },
          },
        }],
      },
    };

    const restored = parseAppBackup(JSON.stringify(legacyBackup));
    expect(restored.historicalFiles[0].document).toMatchObject({
      kind: 'results',
      results: { athleteClubs: [] },
    });
  });
});
