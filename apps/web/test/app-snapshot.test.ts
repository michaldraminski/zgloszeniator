import 'fake-indexeddb/auto';

import { afterEach, describe, expect, it } from 'vitest';

import { clearAppSnapshot, loadAppSnapshot, saveAppSnapshot } from '../src/db/app-snapshot';

describe('app snapshot storage', () => {
  afterEach(async () => {
    await clearAppSnapshot();
  });

  it('restores persisted meet and draft state after loading from IndexedDB', async () => {
    const snapshot = {
      invitation: {
        fileName: 'synthetic-invitation.lef',
        meet: {
          key: 'synthetic-meet',
          name: 'Synthetic Meet',
          course: 'SCM' as const,
          events: [],
          rawXml: '<LENEX />',
        },
      },
      historicalFiles: [],
      localAthletes: [],
      clubDetails: { name: 'Synthetic Club', contactName: '', phone: '', email: '' },
      relayDrafts: [],
      selectedAthleteKeys: ['synthetic-athlete'],
      selectedEventIds: { 'synthetic-athlete': ['synthetic-event'] },
      editedTimes: { 'synthetic-athlete': { 'synthetic-event': '00:01:02.34' } },
    };

    await saveAppSnapshot(snapshot);

    await expect(loadAppSnapshot()).resolves.toEqual(snapshot);
  });
});