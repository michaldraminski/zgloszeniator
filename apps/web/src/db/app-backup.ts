import { z } from 'zod';

import type { AppSnapshot } from './app-snapshot';

const genderSchema = z.enum(['F', 'M']);
const eventGenderSchema = z.enum(['F', 'M', 'X']);
const courseSchema = z.enum(['SCM', 'LCM']);
const incomingAthleteSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  birthYear: z.number().int().safe(),
  gender: genderSchema,
}).strict();
const meetSchema = z.object({
  key: z.string(),
  name: z.string(),
  city: z.string().optional(),
  course: courseSchema,
  meetDate: z.string().optional(),
  deadline: z.string().optional(),
  maxEntriesPerAthlete: z.number().int().safe().optional(),
  ageDate: z.object({ type: z.string(), value: z.string() }).strict().optional(),
  events: z.array(z.object({
    eventId: z.string(),
    number: z.number().int().safe(),
    sessionNumber: z.number().int().safe(),
    gender: eventGenderSchema,
    disciplineKey: z.string().optional(),
    relayCount: z.number().int().safe(),
    ageGroups: z.array(z.object({
      name: z.string(),
      min: z.number().int().safe(),
      max: z.number().int().safe().nullable(),
    }).strict()),
  }).strict()),
  rawXml: z.string(),
}).strict();
const historicalDocumentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('invitation'), meet: meetSchema }).strict(),
  z.object({ kind: z.literal('entry'), entryFile: z.object({
    meet: meetSchema,
    clubs: z.array(z.object({
      name: z.string(),
      contact: z.object({ name: z.string(), phone: z.string(), email: z.string() }).strict(),
      athletes: z.array(z.object({
        firstName: z.string(),
        lastName: z.string(),
        birthYear: z.number().int().safe(),
        gender: genderSchema,
        entries: z.array(z.object({
          eventId: z.string(),
          disciplineKey: z.string(),
          timeCs: z.number().int().safe().nullable(),
        }).strict()),
      }).strict()),
      relays: z.array(z.object({
        name: z.string(),
        gender: eventGenderSchema,
        number: z.number().int().safe(),
        eventId: z.string(),
        eventNumber: z.number().int().safe(),
        sessionNumber: z.number().int().safe(),
        disciplineKey: z.string(),
        timeCs: z.number().int().safe().nullable(),
        ageMin: z.number().int().safe().optional(),
        ageMax: z.number().int().safe().optional(),
        members: z.array(z.object({
          position: z.number().int().safe(),
          athlete: incomingAthleteSchema,
        }).strict()),
      }).strict()),
    }).strict()),
  }).strict() }).strict(),
  z.object({ kind: z.literal('results'), results: z.object({
    meet: meetSchema,
    athletes: z.array(incomingAthleteSchema),
    athleteClubs: z.array(z.object({
      athlete: incomingAthleteSchema,
      clubName: z.string().optional(),
    }).strict()).default([]),
    ignoredAthleteCount: z.number().int().safe().default(0),
    resultEventMappings: z.array(z.object({
      key: z.string(),
      eventId: z.string(),
      meetName: z.string(),
      sourceFileName: z.string().optional(),
      eventNumber: z.number().int().safe().optional(),
      sessionNumber: z.number().int().safe().optional(),
      gender: z.string().optional(),
      relayCount: z.number().int().safe().optional(),
      resultCount: z.number().int().safe(),
      disciplineKey: z.string().optional(),
      resolution: z.enum(['automatic', 'manual', 'unresolved']),
    }).strict()).optional(),
    validResults: z.array(z.object({
      athlete: incomingAthleteSchema,
      eventId: z.string(),
      disciplineKey: z.string().optional(),
      course: courseSchema,
      timeCs: z.number().int().safe(),
    }).strict()),
  }).strict() }).strict(),
]);

const appSnapshotSchema = z.object({
  invitation: z.object({ fileName: z.string(), meet: meetSchema }).strict().nullable(),
  historicalFiles: z.array(z.object({
    fileName: z.string(),
    document: historicalDocumentSchema,
  }).strict()),
  localAthletes: z.array(incomingAthleteSchema),
  clubDetails: z.object({
    name: z.string(),
    contactName: z.string(),
    phone: z.string(),
    email: z.string(),
  }).strict(),
  relayDrafts: z.array(z.object({
    key: z.string(),
    relay: z.object({
      eventId: z.string(),
      number: z.number().int().safe(),
      name: z.string(),
      gender: eventGenderSchema,
      timeCs: z.number().int().safe(),
      ageMin: z.number().int().safe().optional(),
      ageMax: z.number().int().safe().optional(),
      memberAthleteKeys: z.array(z.string()).optional(),
    }).strict(),
    assignMembers: z.boolean(),
    memberAthleteKeys: z.array(z.string().nullable()),
  }).strict()),
  selectedAthleteKeys: z.array(z.string()),
  selectedEventIds: z.record(z.string(), z.array(z.string())),
  editedTimes: z.record(z.string(), z.record(z.string(), z.string())),
  manualResultMappings: z.record(z.string(), z.string()).optional(),
}).strict();

const backupSchema = z.object({
  format: z.literal('lenex-entries-backup'),
  version: z.literal(1),
  snapshot: appSnapshotSchema,
}).strict();

export class BackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupValidationError';
  }
}

export function serializeAppBackup(snapshot: AppSnapshot): string {
  return JSON.stringify({ format: 'lenex-entries-backup', version: 1, snapshot }, null, 2);
}

export function parseAppBackup(json: string): AppSnapshot {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new BackupValidationError('Backup is not valid JSON');
  }
  const parsed = backupSchema.safeParse(value);
  if (!parsed.success) {
    throw new BackupValidationError('Backup format or data is invalid');
  }
  return parsed.data.snapshot;
}
