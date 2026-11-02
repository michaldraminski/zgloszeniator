import Dexie, { type Table } from 'dexie';

import type {
  EntryDraftRelay,
  IncomingAthlete,
  Meet,
  ParsedLenexDocument,
} from '@lenex-entries/core';

export type HistoricalDocument = Exclude<ParsedLenexDocument, { kind: 'invitation' }>;

export interface PersistedRelayDraft {
  key: string;
  relay: EntryDraftRelay;
  assignMembers: boolean;
  memberAthleteKeys: Array<string | null>;
}

export interface AppSnapshot {
  invitation: { fileName: string; meet: Meet } | null;
  historicalFiles: Array<{ fileName: string; document: HistoricalDocument }>;
  localAthletes: IncomingAthlete[];
  clubDetails: {
    name: string;
    contactName: string;
    phone: string;
    email: string;
  };
  relayDrafts: PersistedRelayDraft[];
  selectedAthleteKeys: string[];
  selectedEventIds: Record<string, string[]>;
  editedTimes: Record<string, Record<string, string>>;
}

interface SnapshotRecord {
  key: 'current';
  value: AppSnapshot;
}

class AppDatabase extends Dexie {
  snapshots!: Table<SnapshotRecord, string>;

  constructor() {
    super('lenex-entries');
    this.version(1).stores({ snapshots: 'key' });
  }
}

const database = new AppDatabase();

export async function loadAppSnapshot(): Promise<AppSnapshot | undefined> {
  const record = await database.snapshots.get('current');
  return record?.value;
}

export async function saveAppSnapshot(value: AppSnapshot): Promise<void> {
  await database.snapshots.put({ key: 'current', value });
}

export async function clearAppSnapshot(): Promise<void> {
  await database.snapshots.delete('current');
}

export async function closeAppDatabase(): Promise<void> {
  database.close();
}