import { useEffect, useState, type FormEvent } from 'react';

import {
  buildEntryFile,
  buildAthleteEventOptions,
  getRelayMemberOptions,
  getRelayAgeWarnings,
  getClubMismatch,
  ageAt,
  collectImportedHistory,
  formatTime,
  identityKey,
  parseTime,
  parseLenexDocument,
  readLenexFile,
  type AthleteEntryOptions,
  type AthleteEventOption,
  type Meet,
  type Gender,
  type IncomingAthlete,
  type EntryDraftAthlete,
  type EntryDraftRelay,
  type ParsedLenexDocument,
} from '@lenex-entries/core';

import { pl } from './i18n/pl';
import { filterAthletes } from './roster';
import { addUniqueHistoricalFiles, type HistoricalFileInput } from './file-import';
import { SwimTimeInput } from './SwimTimeInput';
import { relayMemberKeys, setRelayMemberAtPosition, toggleRelayMemberAssignment } from './relay-draft';
import {
  adjustSwimTimeToSecond,
  displaySwimTimeInput,
  formatSwimTime,
  parseSwimTimeInput,
  splitSwimTimeInput,
} from './time-input';
import {
  loadAppSnapshot,
  saveAppSnapshot,
  type PersistedRelayDraft,
} from './db/app-snapshot';
import { BackupValidationError, parseAppBackup, serializeAppBackup } from './db/app-backup';

type InvitationImportState =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'loaded'; fileName: string; meet: Meet }
  | { kind: 'error'; fileName: string; reason: 'invalid' | 'wrong-type'; diagnostic?: string };

type HistoricalFile = HistoricalFileInput;

interface RejectedHistoryFile {
  fileName: string;
  reason: 'invalid' | 'wrong-type';
  diagnostic?: string;
}

interface GeneratedDownload {
  fileName: string;
  url: string;
}

interface RelayChoice {
  key: string;
  eventId: string;
  eventNumber: number;
  disciplineKey: string;
  gender: 'F' | 'M' | 'X';
  relayCount: number;
  ageMin?: number;
  ageMax?: number;
  categoryName: string;
}

async function parseFile(file: File): Promise<ParsedLenexDocument> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { xml } = readLenexFile(file.name, bytes);
  return parseLenexDocument(xml);
}

function getDocumentLabel(document: ParsedLenexDocument): string {
  switch (document.kind) {
    case 'invitation':
      return pl.fileImport.invitation;
    case 'entry':
      return pl.fileImport.entry;
    case 'results':
      return pl.fileImport.results;
  }
}

function getDocumentSummary(document: ParsedLenexDocument): string {
  switch (document.kind) {
    case 'invitation': {
      const disciplineCount = new Set(document.meet.events.map((event) => event.disciplineKey)).size;
      return [
        `${pl.fileImport.events}: ${document.meet.events.length}`,
        `${pl.fileImport.disciplines}: ${disciplineCount}`,
      ].join(' · ');
    }
    case 'entry': {
      const clubs = document.entryFile.clubs;
      const athletes = clubs.flatMap((club) => club.athletes);
      const relays = clubs.flatMap((club) => club.relays);
      const entriesCount = athletes.reduce((sum, athlete) => sum + athlete.entries.length, 0);
      return [
        `${pl.fileImport.clubs}: ${clubs.length}`,
        `${pl.fileImport.athletes}: ${athletes.length}`,
        `${pl.fileImport.entries}: ${entriesCount}`,
        `${pl.fileImport.relays}: ${relays.length}`,
      ].join(' · ');
    }
    case 'results':
      return [
        `${pl.fileImport.athletes}: ${document.results.athletes.length}`,
        `${pl.fileImport.validResults}: ${document.results.validResults.length}`,
        ...(document.results.ignoredAthleteCount > 0
          ? [pl.fileImport.ignoredResultAthletes(document.results.ignoredAthleteCount)]
          : []),
      ].join(' · ');
  }
}

function getSuggestedTimeLabel(option: AthleteEventOption): string {
  const suggestion = option.suggestedTime;
  if (!suggestion) return '';

  const sourceLabel =
    suggestion.source.kind === 'result' ? pl.fileImport.resultSource : pl.fileImport.entrySource;
  const sourceName = suggestion.sourceFileName ?? suggestion.source.meetName;
  const recency = suggestion.source.meetDate
    ? `${pl.fileImport.importedDate}: ${suggestion.source.meetDate}`
    : pl.fileImport.importOrder;
  return `${sourceLabel} · ${sourceName} · ${suggestion.source.meetName} · ${recency}`;
}

export default function App() {
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [persistenceStatus, setPersistenceStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading');
  const [backupMessage, setBackupMessage] = useState('');
  const [storagePersistence, setStoragePersistence] = useState<'unknown' | 'granted' | 'not-granted' | 'unsupported'>('unknown');
  const [invitationState, setInvitationState] = useState<InvitationImportState>({ kind: 'idle' });
  const [historicalFiles, setHistoricalFiles] = useState<HistoricalFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rejectedHistoryFiles, setRejectedHistoryFiles] = useState<RejectedHistoryFile[]>([]);
  const [localAthletes, setLocalAthletes] = useState<IncomingAthlete[]>([]);
  const [athleteForm, setAthleteForm] = useState({
    lastName: '',
    firstName: '',
    birthYear: '',
    gender: 'F' as Gender,
  });
  const [athleteFormError, setAthleteFormError] = useState('');
  const [athleteSearch, setAthleteSearch] = useState('');
  const [clubDetails, setClubDetails] = useState({
    name: '',
    contactName: '',
    phone: '',
    email: '',
  });
  const [generationError, setGenerationError] = useState('');
  const [generationDiagnostic, setGenerationDiagnostic] = useState('');
  const [generatedDownload, setGeneratedDownload] = useState<GeneratedDownload | null>(null);
  const [relayDrafts, setRelayDrafts] = useState<PersistedRelayDraft[]>([]);
  const [relayForm, setRelayForm] = useState({
    choiceKey: '',
    name: '',
    time: '',
  });
  const [selectedAthleteKeys, setSelectedAthleteKeys] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, string[]>>({});
  const [editedTimes, setEditedTimes] = useState<Record<string, Record<string, string>>>({});
  const [duplicateHistoryFiles, setDuplicateHistoryFiles] = useState<string[]>([]);
  const [confirmNewSubmission, setConfirmNewSubmission] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadAppSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if (snapshot) {
          setInvitationState(snapshot.invitation
            ? { kind: 'loaded', ...snapshot.invitation }
            : { kind: 'idle' });
          setHistoricalFiles(snapshot.historicalFiles);
          setLocalAthletes(snapshot.localAthletes);
          setClubDetails(snapshot.clubDetails);
          setRelayDrafts(snapshot.relayDrafts);
          setSelectedAthleteKeys(snapshot.selectedAthleteKeys);
          setSelectedEventIds(snapshot.selectedEventIds);
          setEditedTimes(snapshot.editedTimes);
        }
        setPersistenceStatus('saved');
        setPersistenceReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPersistenceStatus('error');
        setPersistenceReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!navigator.storage?.persisted) {
      setStoragePersistence('unsupported');
      return;
    }
    void navigator.storage.persisted().then((persisted) => {
      setStoragePersistence(persisted ? 'granted' : 'not-granted');
    }).catch(() => setStoragePersistence('unsupported'));
  }, []);

  useEffect(() => {
    if (!persistenceReady) return;
    const snapshot = {
      invitation: invitationState.kind === 'loaded'
        ? { fileName: invitationState.fileName, meet: invitationState.meet }
        : null,
      historicalFiles,
      localAthletes,
      clubDetails,
      relayDrafts,
      selectedAthleteKeys,
      selectedEventIds,
      editedTimes,
    };
    setPersistenceStatus('saving');
    const timeout = window.setTimeout(() => {
      void saveAppSnapshot(snapshot)
        .then(() => setPersistenceStatus('saved'))
        .catch(() => setPersistenceStatus('error'));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [
    persistenceReady,
    invitationState,
    historicalFiles,
    localAthletes,
    clubDetails,
    relayDrafts,
    selectedAthleteKeys,
    selectedEventIds,
    editedTimes,
  ]);

  useEffect(() => {
    const url = generatedDownload?.url;
    return () => {
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [generatedDownload?.url]);
  const importedHistory = collectImportedHistory(
    historicalFiles.map(({ document }) => document),
    historicalFiles.map(({ fileName }) => fileName),
  );
  const rosterByKey = new Map<string, IncomingAthlete>();
  for (const athlete of [...importedHistory.athletes, ...localAthletes]) {
    rosterByKey.set(identityKey(athlete), athlete);
  }
  const rosterAthletes = [...rosterByKey.values()].sort((left, right) => {
    const collator = new Intl.Collator('pl', { sensitivity: 'base' });
    return (
      collator.compare(left.lastName, right.lastName) ||
      collator.compare(left.firstName, right.firstName) ||
      left.birthYear - right.birthYear
    );
  });
  const visibleAthletes = filterAthletes(
    rosterAthletes,
    athleteSearch,
    importedHistory.clubNamesByAthleteKey,
  );
  const historyWithRoster = { ...importedHistory, athletes: rosterAthletes };
  const selectedEntryOptions =
    invitationState.kind === 'loaded'
      ? buildAthleteEventOptions(
          invitationState.meet,
          historyWithRoster,
          new Set(selectedAthleteKeys),
          invitationState.meet.meetDate ?? new Date().toISOString().slice(0, 10),
        )
      : [];
  const relayChoices: RelayChoice[] = invitationState.kind === 'loaded'
    ? invitationState.meet.events
        .filter((event) => event.relayCount > 1 && event.disciplineKey)
        .flatMap((event) => {
          const ageGroups = event.ageGroups.length > 0 ? event.ageGroups : [undefined];
          return ageGroups.map((ageGroup, index) => ({
            key: `${event.eventId}::${index}`,
            eventId: event.eventId,
            eventNumber: event.number,
            disciplineKey: event.disciplineKey!,
            gender: event.gender,
            relayCount: event.relayCount,
            ...(ageGroup ? { ageMin: ageGroup.min, ageMax: ageGroup.max ?? -1 } : {}),
            categoryName: ageGroup?.name ?? '',
          }));
        })
    : [];
  const selectedRelayChoice = relayChoices.find((choice) => choice.key === relayForm.choiceKey) ?? relayChoices[0];
  const entryObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'entry',
  ).length;
  const resultObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'result',
  ).length;
  const selectedAthletes = selectedEntryOptions;
  const selectedEntryCount = selectedAthletes.reduce(
    (count, athlete) =>
      count +
      athlete.events.filter((option) =>
        (selectedEventIds[athlete.athleteKey] ??
          athlete.events
            .filter((candidate) => candidate.suggestedTime)
            .map((candidate) => candidate.event.eventId)
        ).includes(option.event.eventId),
      ).length,
    0,
  );
  const selectedRelayCount = relayDrafts.length;
  const totalSelectedEntryCount = selectedEntryCount + selectedRelayCount;
  const submissionSummaryEntries = selectedAthletes.flatMap((athlete) =>
    athlete.events
      .filter((option) => isEventSelected(athlete, option))
      .map((option) => ({ athlete, option })),
  );

  function isEventSelected(athlete: AthleteEntryOptions, option: AthleteEventOption): boolean {
    return (selectedEventIds[athlete.athleteKey] ??
      athlete.events
        .filter((candidate) => candidate.suggestedTime)
        .map((candidate) => candidate.event.eventId)
    ).includes(option.event.eventId);
  }

  function toggleEvent(athlete: AthleteEntryOptions, eventId: string, checked: boolean): void {
    setGeneratedDownload(null);
    setSelectedEventIds((current) => {
      const currentIds = current[athlete.athleteKey] ?? athlete.events
        .filter((option) => option.suggestedTime)
        .map((option) => option.event.eventId);
      const nextIds = checked
        ? [...new Set([...currentIds, eventId])]
        : currentIds.filter((currentId) => currentId !== eventId);
      return { ...current, [athlete.athleteKey]: nextIds };
    });
  }

  function updateTime(athleteKey: string, eventId: string, value: string): void {
    setGenerationError('');
    setGenerationDiagnostic('');
    setGeneratedDownload(null);
    setEditedTimes((current) => ({
      ...current,
      [athleteKey]: { ...current[athleteKey], [eventId]: value },
    }));
  }

  function addRelay(): void {
    if (!selectedRelayChoice) {
      return;
    }
    const timeCs = parseSwimTimeInput(relayForm.time);
    if (timeCs === null) {
      setGenerationError(pl.relay.invalidTime);
      return;
    }
    const name = relayForm.name.trim() || selectedRelayChoice.categoryName;
    if (!name) {
      setGenerationError(pl.relay.categoryRequired);
      return;
    }
    const relay: EntryDraftRelay = {
      eventId: selectedRelayChoice.eventId,
      number: 1,
      name,
      gender: selectedRelayChoice.gender,
      timeCs,
      ...(selectedRelayChoice.ageMin !== undefined ? { ageMin: selectedRelayChoice.ageMin } : {}),
      ...(selectedRelayChoice.ageMax !== undefined ? { ageMax: selectedRelayChoice.ageMax } : {}),
    };
    setRelayDrafts((current) => [
      ...current,
      {
        key: globalThis.crypto.randomUUID(),
        relay,
        assignMembers: false,
        memberAthleteKeys: [],
      },
    ]);
    setGenerationError('');
    setGenerationDiagnostic('');
    setGeneratedDownload(null);
    setRelayForm((current) => ({ ...current, time: '' }));
  }

  function removeRelay(relayKey: string): void {
    setRelayDrafts((current) => current.filter((row) => row.key !== relayKey));
    setGeneratedDownload(null);
  }

  function setRelayMemberAssignment(relayKey: string, enabled: boolean): void {
    setRelayDrafts((current) => current.map((row) => {
      if (row.key !== relayKey) {
        return row;
      }
      const event = invitationState.kind === 'loaded'
        ? invitationState.meet.events.find((candidate) => candidate.eventId === row.relay.eventId)
        : undefined;
      return {
        ...row,
        ...toggleRelayMemberAssignment(row, enabled, event?.relayCount ?? 0),
      };
    }));
    setGeneratedDownload(null);
  }

  function setRelayMember(relayKey: string, position: number, athleteKey: string): void {
    setRelayDrafts((current) => current.map((row) => {
      if (row.key !== relayKey) {
        return row;
      }
      return { ...row, ...setRelayMemberAtPosition(row, position, athleteKey) };
    }));
    setGenerationError('');
    setGenerationDiagnostic('');
    setGeneratedDownload(null);
  }

  function generateEntryFile(): void {
    if (invitationState.kind !== 'loaded') {
      return;
    }
    setGenerationError('');
    setGenerationDiagnostic('');
    const athletes: EntryDraftAthlete[] = [];

    for (const athlete of selectedEntryOptions) {
      const entries: EntryDraftAthlete['entries'] = [];
      for (const option of athlete.events) {
        if (!isEventSelected(athlete, option)) {
          continue;
        }
        const eventId = option.event.eventId;
        const value = editedTimes[athlete.athleteKey]?.[eventId] ??
          (option.suggestedTime ? formatTime(option.suggestedTime.timeCs) : '');
        const timeCs = parseSwimTimeInput(value);
        if (timeCs === null) {
          setGenerationError(pl.export.invalidOrMissingTime);
          return;
        }
        entries.push({ eventId, timeCs });
      }
      if (entries.length > 0) {
        athletes.push({
          firstName: athlete.athlete.firstName,
          lastName: athlete.athlete.lastName,
          birthYear: athlete.athlete.birthYear,
          gender: athlete.athlete.gender,
          entries,
        });
      }
    }

    if (athletes.length === 0 && relayDrafts.length === 0) {
      setGenerationError(pl.export.noEntriesSelected);
      return;
    }

    try {
      const relays = relayDrafts.map(({ relay, memberAthleteKeys }) => ({
        ...relay,
        memberAthleteKeys: relayMemberKeys({ assignMembers: true, memberAthleteKeys }),
      }));
      const includedAthleteKeys = new Set(athletes.map((athlete) => identityKey(athlete)));
      for (const relay of relays) {
        for (const memberKey of relay.memberAthleteKeys ?? []) {
          if (includedAthleteKeys.has(memberKey)) {
            continue;
          }
          const member = rosterByKey.get(memberKey);
          if (!member) {
            setGenerationError(pl.relay.unknownMember);
            return;
          }
          athletes.push({ ...member, entries: [] });
          includedAthleteKeys.add(memberKey);
        }
      }

      const bytes = buildEntryFile(invitationState.meet, {
        club: {
          name: clubDetails.name,
          contact: {
            name: clubDetails.contactName,
            phone: clubDetails.phone,
            email: clubDetails.email,
          },
        },
        athletes,
        relays,
      });
      const buffer = bytes.slice().buffer as ArrayBuffer;
      const blob = new Blob([buffer], { type: 'application/zip' });
      const objectUrl = URL.createObjectURL(blob);
      const safeMeetName = (invitationState.meet.city || invitationState.meet.name)
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .trim() || 'zgłoszenie';
      const safeClubName = clubDetails.name
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-')
        .trim();
      const fileName = `Zgłoszenie - ${safeClubName} - ${safeMeetName}.lxf`;
      setGeneratedDownload({ fileName, url: objectUrl });
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (error) {
      setGenerationError(pl.export.generationFailed);
      setGenerationDiagnostic(error instanceof Error ? error.message : 'Unknown generation error');
    }
  }

  function addAthlete(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const birthYear = Number(athleteForm.birthYear);
    const athlete: IncomingAthlete = {
      lastName: athleteForm.lastName.trim(),
      firstName: athleteForm.firstName.trim(),
      birthYear,
      gender: athleteForm.gender,
    };

    if (
      !athlete.lastName ||
      !athlete.firstName ||
      !Number.isSafeInteger(birthYear) ||
      birthYear < 1900 ||
      birthYear > 2100
    ) {
      setAthleteFormError(pl.roster.invalidAthlete);
      return;
    }

    const athleteKey = identityKey(athlete);
    if (rosterByKey.has(athleteKey)) {
      setAthleteFormError(pl.roster.duplicateAthlete);
      return;
    }

    setLocalAthletes((current) => [...current, athlete]);
    setSelectedAthleteKeys((current) => [...current, athleteKey]);
    setGeneratedDownload(null);
    setAthleteFormError('');
    setAthleteForm({ lastName: '', firstName: '', birthYear: '', gender: 'F' });
  }

  function exportBackup(): void {
    const snapshot = {
      invitation: invitationState.kind === 'loaded'
        ? { fileName: invitationState.fileName, meet: invitationState.meet }
        : null,
      historicalFiles,
      localAthletes,
      clubDetails,
      relayDrafts,
      selectedAthleteKeys,
      selectedEventIds,
      editedTimes,
    };
    const blob = new Blob([serializeAppBackup(snapshot)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `lenex-entries-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupMessage(pl.fileImport.backupExported);
  }

  async function importBackup(file: File): Promise<void> {
    try {
      const snapshot = parseAppBackup(await file.text());
      await saveAppSnapshot(snapshot);
      setInvitationState(snapshot.invitation
        ? { kind: 'loaded', ...snapshot.invitation }
        : { kind: 'idle' });
      setHistoricalFiles(snapshot.historicalFiles);
      setLocalAthletes(snapshot.localAthletes);
      setClubDetails(snapshot.clubDetails);
      setRelayDrafts(snapshot.relayDrafts);
      setSelectedAthleteKeys(snapshot.selectedAthleteKeys);
      setSelectedEventIds(snapshot.selectedEventIds);
      setEditedTimes(snapshot.editedTimes);
      setGeneratedDownload(null);
      setGenerationError('');
      setGenerationDiagnostic('');
      setPersistenceStatus('saved');
      setBackupMessage(pl.fileImport.backupImported);
    } catch (error) {
      setBackupMessage(error instanceof BackupValidationError
        ? pl.fileImport.backupInvalid
        : pl.fileImport.backupError);
    }
  }

  async function requestPersistentStorage(): Promise<void> {
    if (!navigator.storage?.persist) {
      setStoragePersistence('unsupported');
      return;
    }
    try {
      setStoragePersistence(await navigator.storage.persist() ? 'granted' : 'not-granted');
    } catch {
      setStoragePersistence('not-granted');
    }
  }

  const hasMeet = invitationState.kind === 'loaded';
  const sectionLinks = [
    { href: '#import-section', title: pl.workflow.invitation },
    ...(hasMeet ? [{ href: '#roster-section', title: pl.workflow.submission }] : []),
    ...(hasMeet ? [{
      href: '#export-section',
      title: pl.workflow.export,
    }] : []),
  ];

  async function loadInvitation(file: File): Promise<void> {
    setInvitationState({ kind: 'loading', fileName: file.name });

    try {
      const document = await parseFile(file);
      if (document.kind !== 'invitation') {
        setInvitationState({ kind: 'error', fileName: file.name, reason: 'wrong-type' });
        return;
      }
      setSelectedAthleteKeys(localAthletes.map((athlete) => identityKey(athlete)));
      setSelectedEventIds({});
      setEditedTimes({});
      setRelayDrafts([]);
      setRelayForm({ choiceKey: '', name: '', time: '' });
      setGeneratedDownload(null);
      setInvitationState({ kind: 'loaded', fileName: file.name, meet: document.meet });
    } catch (error) {
      setInvitationState({
        kind: 'error',
        fileName: file.name,
        reason: 'invalid',
        ...(error instanceof Error ? { diagnostic: error.message } : {}),
      });
    }
    }

  async function loadHistory(files: File[]): Promise<void> {
    setHistoryLoading(true);
    setRejectedHistoryFiles([]);
    setDuplicateHistoryFiles([]);
    const accepted: HistoricalFile[] = [];
    const rejected: RejectedHistoryFile[] = [];

    for (const file of files) {
      try {
        const document = await parseFile(file);
        accepted.push({ fileName: file.name, document });
      } catch (error) {
        rejected.push({
          fileName: file.name,
          reason: 'invalid',
          ...(error instanceof Error ? { diagnostic: error.message } : {}),
        });
      }
    }

    const unique = addUniqueHistoricalFiles(historicalFiles, accepted);
    setHistoricalFiles((current) => addUniqueHistoricalFiles(current, accepted).files);
    setDuplicateHistoryFiles(unique.duplicateFileNames);
    setRejectedHistoryFiles(rejected);
    setGeneratedDownload(null);
    setHistoryLoading(false);
  }

  function removeHistoricalFile(document: HistoricalFile['document']): void {
    const fingerprint = JSON.stringify(document);
    setHistoricalFiles((current) => current.filter((file) => JSON.stringify(file.document) !== fingerprint));
    setDuplicateHistoryFiles([]);
    setGeneratedDownload(null);
  }

  function startNewSubmission(): void {
    if (invitationState.kind !== 'loaded') return;
    const referenceInvitation: HistoricalFile = {
      fileName: invitationState.fileName,
      document: { kind: 'invitation', meet: invitationState.meet },
    };
    setHistoricalFiles((current) => addUniqueHistoricalFiles(current, [referenceInvitation]).files);
    setInvitationState({ kind: 'idle' });
    setSelectedAthleteKeys(localAthletes.map(identityKey));
    setSelectedEventIds({});
    setEditedTimes({});
    setRelayDrafts([]);
    setRelayForm({ choiceKey: '', name: '', time: '' });
    setGeneratedDownload(null);
    setGenerationError('');
    setGenerationDiagnostic('');
    setConfirmNewSubmission(false);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">{pl.workflow.eyebrow}</p>
          <h1>{pl.title}</h1>
          <p className="header-description">{pl.appDescription}</p>
        </div>
        <span className="local-badge">{pl.workflow.localBadge}</span>
      </header>

      <nav className="section-nav" aria-label={pl.workflow.label}>
        {sectionLinks.map((section) => (
          <a className="section-nav-link" href={section.href} key={section.href}>
            {section.title}
          </a>
        ))}
      </nav>

      <section className="panel" id="import-section">
        <h2>{pl.sections.import}</h2>
        <h3>{pl.fileImport.invitationHeading}</h3>
        <p>{pl.fileImport.invitationHint}</p>
        <label
          className={`file-picker${invitationState.kind === 'loading' ? ' file-picker-disabled' : ''}`}
        >
          <span>{pl.fileImport.chooseInvitation}</span>
          <input
            className="file-input"
            type="file"
            accept=".lxf,.lef,application/zip,application/xml,text/xml"
            disabled={!persistenceReady || invitationState.kind === 'loading'}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                void loadInvitation(file);
              }
            }}
          />
        </label>

        {invitationState.kind === 'loading' && (
          <p className="import-message" role="status">
            {pl.fileImport.loading} {invitationState.fileName}
          </p>
        )}

        {invitationState.kind === 'error' && (
          <div className="import-result import-result-error" role="alert">
            <strong>{pl.fileImport.errorHeading}</strong>
            <p>{invitationState.fileName}</p>
            <p>
              {invitationState.reason === 'wrong-type'
                ? pl.fileImport.expectedInvitation
                : pl.fileImport.errorFallback}
            </p>
            {invitationState.diagnostic && (
              <details>
                <summary>{pl.fileImport.diagnosticLabel}</summary>
                <code>{invitationState.diagnostic}</code>
              </details>
            )}
          </div>
        )}

        {invitationState.kind === 'loaded' && (
          <div className="import-result" role="status">
            <p className="import-kind">{pl.fileImport.invitation}</p>
            <h3>{invitationState.meet.name}</h3>
            <p>{invitationState.fileName}</p>
            <p>{getDocumentSummary({ kind: 'invitation', meet: invitationState.meet })}</p>
            <p className="privacy-note">{pl.fileImport.ageRule}</p>
            {!confirmNewSubmission ? (
              <button
                className="secondary-action-button new-submission-button"
                type="button"
                onClick={() => setConfirmNewSubmission(true)}
              >
                {pl.fileImport.newSubmission}
              </button>
            ) : (
              <div className="new-submission-confirmation" role="alert">
                <p>{pl.fileImport.newSubmissionConfirm}</p>
                <div>
                  <button className="secondary-action-button" type="button" onClick={startNewSubmission}>
                    {pl.fileImport.confirmNewSubmission}
                  </button>
                  <button className="text-action-button" type="button" onClick={() => setConfirmNewSubmission(false)}>
                    {pl.fileImport.cancelNewSubmission}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <hr />

        <h3>{pl.fileImport.historyHeading}</h3>
        <p>{pl.fileImport.historyHint}</p>
        <p className="privacy-note">{pl.fileImport.localOnlyHint}</p>
        <p className={`privacy-note persistence-${persistenceStatus}`} role="status">
          {pl.fileImport.persistence[persistenceStatus]}
        </p>
        <details className="advanced-storage-tools">
          <summary>{pl.fileImport.storageTools}</summary>
          <p className="privacy-note">{pl.fileImport.backupHelp}</p>
          <div className="backup-actions">
            <button type="button" disabled={!persistenceReady} onClick={exportBackup}>
              {pl.fileImport.exportBackup}
            </button>
            <label className={`file-picker${persistenceReady ? '' : ' file-picker-disabled'}`}>
              <span>{pl.fileImport.importBackup}</span>
              <input
                className="file-input"
                type="file"
                accept="application/json,.json"
                disabled={!persistenceReady}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = '';
                  if (file) void importBackup(file);
                }}
              />
            </label>
            {backupMessage && <p className="privacy-note" role="status">{backupMessage}</p>}
          </div>
          {storagePersistence === 'granted' ? (
            <p className="privacy-note" role="status">{pl.fileImport.storageProtected}</p>
          ) : (
            <div className="backup-actions">
              <button type="button" onClick={() => void requestPersistentStorage()}>
                {pl.fileImport.requestStorageProtection}
              </button>
              {storagePersistence === 'unsupported' && (
                <p className="privacy-note">{pl.fileImport.storageProtectionUnavailable}</p>
              )}
              {storagePersistence === 'not-granted' && (
                <p className="privacy-note">{pl.fileImport.storageNotProtected}</p>
              )}
            </div>
          )}
        </details>
        <p className="privacy-note">{pl.fileImport.timePriorityHint}</p>
        <label
          className={`file-picker${invitationState.kind !== 'loaded' ? ' file-picker-disabled' : ''}`}
        >
          <span>{pl.fileImport.chooseHistory}</span>
          <input
            className="file-input"
            type="file"
            accept=".lxf,.lef,application/zip,application/xml,text/xml"
            multiple
            disabled={!persistenceReady || invitationState.kind !== 'loaded' || historyLoading}
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
              if (files.length > 0) {
                void loadHistory(files);
              }
            }}
          />
        </label>

        {historyLoading && (
          <p className="import-message" role="status">
            {pl.fileImport.loading}
          </p>
        )}

        {rejectedHistoryFiles.length > 0 && (
          <div className="import-result import-result-error" role="alert">
            <strong>{pl.fileImport.errorHeading}</strong>
            {rejectedHistoryFiles.map((file, index) => (
              <div key={`${file.fileName}-${index}`}>
                <p>
                  {file.fileName}: {file.reason === 'wrong-type'
                    ? pl.fileImport.expectedHistory
                    : pl.fileImport.errorFallback}
                </p>
                {file.diagnostic && (
                  <details>
                    <summary>{pl.fileImport.diagnosticLabel}</summary>
                    <code>{file.diagnostic}</code>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {historicalFiles.length > 0 && (
          <div className="import-result" role="status">
            <h3>{pl.fileImport.historySummary}</h3>
            <p>
              {pl.fileImport.athletes}: {importedHistory.athletes.length}
            </p>
            <p>
              {pl.fileImport.entryTimes}: {entryObservationCount} · {pl.fileImport.resultTimes}:{' '}
              {resultObservationCount}
            </p>
            {importedHistory.unresolvedResultCount > 0 && (
              <p className="unresolved-results" role="status">
                {pl.fileImport.unresolvedResults(importedHistory.unresolvedResultCount)}
              </p>
            )}
            {duplicateHistoryFiles.length > 0 && (
              <p className="privacy-note" role="status">
                {pl.fileImport.duplicateHistory(duplicateHistoryFiles.length)}
              </p>
            )}
            <h4>{pl.fileImport.historyImported}</h4>
            <ul>
              {historicalFiles.map(({ fileName, document }, index) => (
                <li className="history-file-item" key={`${fileName}-${index}`}>
                  <span>
                    {getDocumentLabel(document)} — {fileName}: {getDocumentSummary(document)}
                  </span>
                  <button
                    className="remove-history-file-button"
                    type="button"
                    aria-label={pl.fileImport.removeHistoryFile(fileName)}
                    onClick={() => removeHistoricalFile(document)}
                  >
                    {pl.fileImport.removeHistoryFileAction}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

      </section>

      {invitationState.kind === 'loaded' && (
        <section className="panel roster-panel" id="roster-section">
          <h2>{pl.sections.roster}</h2>
          <p>{pl.roster.description}</p>
          <form className="athlete-form" onSubmit={addAthlete}>
            <label>
              <span>{pl.roster.lastName}</span>
              <input
                required
                value={athleteForm.lastName}
                onChange={(event) => setAthleteForm((current) => ({ ...current, lastName: event.target.value }))}
              />
            </label>
            <label>
              <span>{pl.roster.firstName}</span>
              <input
                required
                value={athleteForm.firstName}
                onChange={(event) => setAthleteForm((current) => ({ ...current, firstName: event.target.value }))}
              />
            </label>
            <label>
              <span>{pl.roster.birthYear}</span>
              <input
                required
                type="number"
                inputMode="numeric"
                min="1900"
                max="2100"
                step="1"
                value={athleteForm.birthYear}
                onChange={(event) => setAthleteForm((current) => ({ ...current, birthYear: event.target.value }))}
              />
            </label>
            <label>
              <span>{pl.roster.gender}</span>
              <select
                value={athleteForm.gender}
                onChange={(event) => setAthleteForm((current) => ({ ...current, gender: event.target.value as Gender }))}
              >
                <option value="F">{pl.roster.genderFemale}</option>
                <option value="M">{pl.roster.genderMale}</option>
              </select>
            </label>
            <button type="submit">{pl.roster.addAthlete}</button>
          </form>
          {athleteFormError && <p className="form-error" role="alert">{athleteFormError}</p>}
          {localAthletes.length > 0 && (
            <p className="privacy-note">{pl.roster.sessionOnly} {localAthletes.length}</p>
          )}
        </section>
      )}

      {invitationState.kind === 'loaded' && (
        <section className="panel entry-planner" id="entries-section">
          <div className="entry-planner-header">
            <div>
              <h2>{pl.fileImport.selectionHeading}</h2>
              <p>{invitationState.meet.name}</p>
            </div>
            <p className="selection-counts">
              {pl.fileImport.selectedAthletes}: {selectedAthletes.length} ·{' '}
              {pl.fileImport.selectedEntries}: {totalSelectedEntryCount}
            </p>
          </div>

          {rosterAthletes.length === 0 ? (
            <p>{pl.fileImport.noAthletes}</p>
          ) : (
            <>
              <div className="selection-actions">
                <button
                  className="secondary-action-button"
                  type="button"
                  onClick={() => {
                    setGeneratedDownload(null);
                    setSelectedAthleteKeys((current) => [
                      ...new Set([...current, ...visibleAthletes.map((athlete) => identityKey(athlete))]),
                    ]);
                  }}
                >
                  {pl.fileImport.selectVisibleAthletes}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGeneratedDownload(null);
                    setSelectedAthleteKeys([]);
                  }}
                >
                  {pl.fileImport.clearAthletes}
                </button>
              </div>

              <label className="athlete-search">
                <span>{pl.roster.search}</span>
                <input
                  type="search"
                  value={athleteSearch}
                  onChange={(event) => setAthleteSearch(event.target.value)}
                  placeholder={pl.roster.searchPlaceholder}
                />
              </label>

              <div className="entry-planner-grid">
                <div className="athlete-list" aria-label={pl.fileImport.athleteListLabel}>
                  {visibleAthletes.length === 0 && (
                    <p className="athlete-search-empty">{pl.roster.noSearchResults}</p>
                  )}
                  {visibleAthletes.map((athlete) => {
                    const athleteKey = identityKey(athlete);
                    return (
                    <label className="athlete-choice" key={athleteKey}>
                      <input
                        type="checkbox"
                        checked={selectedAthleteKeys.includes(athleteKey)}
                        onChange={(event) => {
                          setGeneratedDownload(null);
                          if (!event.target.checked) {
                            setRelayDrafts((current) => current.map((row) => ({
                              ...row,
                              memberAthleteKeys: row.memberAthleteKeys.map((memberKey) =>
                                memberKey === athleteKey ? null : memberKey,
                              ),
                            })));
                          }
                          setSelectedAthleteKeys((current) =>
                            event.target.checked
                              ? [...current, athleteKey]
                              : current.filter((key) => key !== athleteKey),
                          );
                        }}
                      />
                      <span>
                        {athlete.lastName}, {athlete.firstName} ({athlete.birthYear})
                        <small className="athlete-club-label" title={
                          (importedHistory.clubNamesByAthleteKey.get(athleteKey) ?? []).join(' / ') || pl.fileImport.clubUnknown
                        }>
                          {(importedHistory.clubNamesByAthleteKey.get(athleteKey) ?? []).join(' / ') || pl.fileImport.clubUnknown}
                        </small>
                      </span>
                    </label>
                    );
                  })}
                </div>

                <div className="athlete-entry-options">
                  {selectedAthletes.map((athlete) => (
                    <fieldset className="athlete-entry-card" key={athlete.athleteKey}>
                      <legend>
                        {athlete.athlete.lastName}, {athlete.athlete.firstName} ({athlete.athlete.birthYear})
                      </legend>
                      {getClubMismatch(
                        importedHistory.clubNamesByAthleteKey.get(athlete.athleteKey) ?? [],
                        clubDetails.name,
                      ).length > 0 && (
                        <p className="club-mismatch-warning" role="status">
                          {pl.fileImport.clubMismatch(
                            getClubMismatch(
                              importedHistory.clubNamesByAthleteKey.get(athlete.athleteKey) ?? [],
                              clubDetails.name,
                            ),
                            clubDetails.name,
                          )}
                        </p>
                      )}
                      {athlete.events.length === 0 ? (
                        <p>{pl.fileImport.noEligibleEvents}</p>
                      ) : (
                        <div className="discipline-options">
                          {athlete.events.map((option) => {
                            const eventId = option.event.eventId;
                            const checked = isEventSelected(athlete, option);
                            const editedValue = editedTimes[athlete.athleteKey]?.[eventId];
                            const value = editedValue === undefined
                              ? (option.suggestedTime ? formatSwimTime(option.suggestedTime.timeCs) : '')
                              : displaySwimTimeInput(editedValue);
                            const timeSegments = splitSwimTimeInput(value);
                            const completeTime = Boolean(
                              timeSegments.minutes && timeSegments.seconds && timeSegments.centiseconds,
                            );
                            const invalidTime = (
                              completeTime && parseSwimTimeInput(value) === null
                            ) || Number(timeSegments.minutes) > 5999 || Number(timeSegments.seconds) > 59;

                            return (
                              <div className="discipline-option" key={eventId}>
                                <label>
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={(event) =>
                                      toggleEvent(athlete, eventId, event.target.checked)
                                    }
                                  />
                                  <span>
                                    {option.event.number}. {option.event.disciplineKey}
                                  </span>
                                </label>
                                  <div className="time-control">
                                    <div className="time-field">
                                      <SwimTimeInput
                                        value={value}
                                        disabled={!checked}
                                        invalid={invalidTime}
                                        errorId={`time-error-${athlete.athleteKey}-${eventId}`}
                                        athleteLabel={`${athlete.athlete.lastName}, ${athlete.athlete.firstName}`}
                                        disciplineLabel={option.event.disciplineKey ?? ''}
                                        onChange={(nextValue) => updateTime(athlete.athleteKey, eventId, nextValue)}
                                      />
                                      {invalidTime && (
                                        <small className="time-error" role="alert" id={`time-error-${athlete.athleteKey}-${eventId}`}>
                                          {pl.fileImport.invalidTime}
                                        </small>
                                      )}
                                    </div>
                                  <div className="time-adjustment-controls">
                                    <button
                                      type="button"
                                      aria-label={`${pl.fileImport.roundTimeUp} — ${athlete.athlete.lastName}, ${option.event.disciplineKey}`}
                                      title={pl.fileImport.roundTimeUp}
                                      disabled={!checked || parseSwimTimeInput(value) === null}
                                      onClick={() => {
                                        const adjusted = adjustSwimTimeToSecond(value, 'up');
                                        if (adjusted !== null) updateTime(athlete.athleteKey, eventId, adjusted);
                                      }}
                                    >+</button>
                                    <button
                                      type="button"
                                      aria-label={`${pl.fileImport.roundTimeDown} — ${athlete.athlete.lastName}, ${option.event.disciplineKey}`}
                                      title={pl.fileImport.roundTimeDown}
                                      disabled={!checked || parseSwimTimeInput(value) === null}
                                      onClick={() => {
                                        const adjusted = adjustSwimTimeToSecond(value, 'down');
                                        if (adjusted !== null) updateTime(athlete.athleteKey, eventId, adjusted);
                                      }}
                                    >−</button>
                                    {option.suggestedTime && (
                                      <button
                                        className="time-reset-button"
                                        type="button"
                                        aria-label={`${pl.fileImport.restoreSuggestedTime} — ${athlete.athlete.lastName}, ${option.event.disciplineKey}`}
                                        title={pl.fileImport.restoreSuggestedTime}
                                        disabled={!checked}
                                        onClick={() => updateTime(
                                          athlete.athleteKey,
                                          eventId,
                                          formatSwimTime(option.suggestedTime!.timeCs),
                                        )}
                                      >↶</button>
                                    )}
                                  </div>
                                </div>
                                {option.suggestedTime && (
                                  <small className="time-source">{getSuggestedTimeLabel(option)}</small>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </fieldset>
                  ))}
                </div>
              </div>
            </>
          )}

          <section className="relay-panel" aria-labelledby="relay-heading">
            <h3 id="relay-heading">{pl.relay.heading}</h3>
            <p>{pl.relay.optionalMembersNote}</p>
            {relayChoices.length === 0 ? (
              <p>{pl.relay.noRelayEvents}</p>
            ) : (
              <>
                <div className="relay-form">
                  <label>
                    <span>{pl.relay.event}</span>
                    <select
                      value={selectedRelayChoice?.key ?? ''}
                      onChange={(event) => {
                        const nextChoice = relayChoices.find((choice) => choice.key === event.target.value);
                        setRelayForm({
                          choiceKey: event.target.value,
                          name: nextChoice?.categoryName ?? '',
                          time: relayForm.time,
                        });
                        setGenerationError('');
                      }}
                    >
                      {relayChoices.map((choice) => (
                        <option key={choice.key} value={choice.key}>
                          {choice.eventNumber}. {choice.disciplineKey} · {choice.categoryName || pl.relay.categoryUnspecified}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>{pl.relay.category}</span>
                    <input
                      value={relayForm.name}
                      onChange={(event) => setRelayForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </label>
                  <div className="relay-time-field">
                    <span>{pl.relay.time}</span>
                    <div className="time-control">
                      <div className="time-field">
                        <SwimTimeInput
                          value={relayForm.time}
                          athleteLabel={pl.relay.time}
                          disciplineLabel={selectedRelayChoice?.disciplineKey ?? pl.relay.heading}
                          onChange={(time) => setRelayForm((current) => ({ ...current, time }))}
                        />
                      </div>
                      <div className="time-adjustment-controls">
                        <button
                          type="button"
                          aria-label={pl.fileImport.roundTimeUp}
                          title={pl.fileImport.roundTimeUp}
                          disabled={parseSwimTimeInput(relayForm.time) === null}
                          onClick={() => {
                            const adjusted = adjustSwimTimeToSecond(relayForm.time, 'up');
                            if (adjusted !== null) setRelayForm((current) => ({ ...current, time: adjusted }));
                          }}
                        >+</button>
                        <button
                          type="button"
                          aria-label={pl.fileImport.roundTimeDown}
                          title={pl.fileImport.roundTimeDown}
                          disabled={parseSwimTimeInput(relayForm.time) === null}
                          onClick={() => {
                            const adjusted = adjustSwimTimeToSecond(relayForm.time, 'down');
                            if (adjusted !== null) setRelayForm((current) => ({ ...current, time: adjusted }));
                          }}
                        >−</button>
                      </div>
                    </div>
                  </div>
                  <button type="button" onClick={addRelay}>{pl.relay.add}</button>
                </div>
                {relayDrafts.length > 0 && (
                  <ul className="relay-list">
                    {relayDrafts.map((row) => {
                      const { key, relay } = row;
                      const choice = relayChoices.find((item) => item.eventId === relay.eventId);
                      const event = invitationState.kind === 'loaded'
                        ? invitationState.meet.events.find((item) => item.eventId === relay.eventId)
                        : undefined;
                      const relayMembers = row.memberAthleteKeys
                        .filter((athleteKey): athleteKey is string => athleteKey !== null)
                        .map((athleteKey) => rosterByKey.get(athleteKey))
                        .filter((athlete): athlete is IncomingAthlete => athlete !== undefined);
                      const ageWarnings = invitationState.kind === 'loaded'
                        ? getRelayAgeWarnings(
                            invitationState.meet,
                            relay.name,
                            relay.ageMax,
                            relayMembers,
                          )
                        : [];
                      return (
                        <li key={key}>
                          <div className="relay-row-content">
                            <strong>
                              {choice?.eventNumber}. {choice?.disciplineKey} · {relay.name} · {formatSwimTime(relay.timeCs)}
                            </strong>
                            <label className="relay-members-toggle">
                              <input
                                type="checkbox"
                                checked={row.assignMembers}
                                onChange={(event) => setRelayMemberAssignment(key, event.target.checked)}
                              />
                              <span>{pl.relay.assignMembers}</span>
                            </label>
                            {row.assignMembers && (
                              <div className="relay-member-slots">
                                {Array.from({ length: event?.relayCount ?? 0 }, (_, position) => {
                                  const currentKey = row.memberAthleteKeys[position] ?? '';
                                  const previousPositionEmpty = position > 0 &&
                                    !row.memberAthleteKeys[position - 1];
                                  const relayGender = choice?.gender ?? 'X';
                                  const compatibleAthletes = getRelayMemberOptions(
                                    rosterAthletes,
                                    new Set(selectedAthleteKeys),
                                    relayGender,
                                  );
                                  const usedElsewhere = new Set(
                                    row.memberAthleteKeys.filter((value, index) => index !== position && value),
                                  );
                                  return (
                                    <label key={position}>
                                      <span>{pl.relay.position} {position + 1}</span>
                                      <select
                                        value={currentKey}
                                        disabled={previousPositionEmpty || compatibleAthletes.length === 0}
                                        onChange={(change) => setRelayMember(key, position, change.target.value)}
                                      >
                                        <option value="">{pl.relay.noMember}</option>
                                        {compatibleAthletes.map((athlete) => {
                                          const athleteKey = identityKey(athlete);
                                          return (
                                            <option
                                              key={athleteKey}
                                              value={athleteKey}
                                              disabled={usedElsewhere.has(athleteKey)}
                                            >
                                              {athlete.lastName}, {athlete.firstName} ({athlete.birthYear})
                                            </option>
                                          );
                                        })}
                                      </select>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            {ageWarnings.length > 0 && (
                              <p className="relay-age-warning" role="status">
                                {ageWarnings.map((warning) =>
                                  warning.reason === 'adult-in-junior-and-over-category-limit'
                                    ? pl.relay.adultInJuniorAndOverAgeWarning(warning.athlete.firstName, warning.athlete.lastName, warning.age)
                                    : warning.reason === 'adult-in-junior'
                                      ? pl.relay.adultInJuniorWarning(warning.athlete.firstName, warning.athlete.lastName, warning.age)
                                      : pl.relay.overAgeWarning(warning.athlete.firstName, warning.athlete.lastName, warning.age),
                                ).join(' ')}
                              </p>
                            )}
                          </div>
                          <button type="button" onClick={() => removeRelay(key)}>{pl.relay.remove}</button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </section>

          <div className="export-panel" id="export-section">
            <h3>{pl.export.heading}</h3>
            <p>{pl.export.help}</p>
            <section className="submission-summary" id="submission-summary" aria-labelledby="submission-summary-heading">
              <div className="submission-summary-header">
                <div>
                  <h4 id="submission-summary-heading">{pl.export.summaryHeading}</h4>
                  <p>{invitationState.meet.name} · {clubDetails.name || pl.export.clubName}</p>
                </div>
                <a
                  className="secondary-action-button"
                  href="#submission-summary"
                >
                  {pl.export.summaryAction}
                </a>
              </div>
              <p className="privacy-note">
                {pl.export.summaryCount(submissionSummaryEntries.length, relayDrafts.length)}
              </p>
              <h5>{pl.export.individualEntries}</h5>
              {submissionSummaryEntries.length > 0 ? (
                <ul>
                  {submissionSummaryEntries.map(({ athlete, option }) => {
                    const eventId = option.event.eventId;
                    const editedValue = editedTimes[athlete.athleteKey]?.[eventId];
                    const time = editedValue !== undefined
                      ? displaySwimTimeInput(editedValue)
                      : option.suggestedTime ? formatSwimTime(option.suggestedTime.timeCs) : '';
                    return (
                      <li key={`${athlete.athleteKey}-${eventId}`}>
                        {athlete.athlete.lastName}, {athlete.athlete.firstName} ({athlete.athlete.birthYear}) — {option.event.number}. {option.event.disciplineKey}: {time || pl.export.missingTime}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{pl.export.noIndividualEntries}</p>
              )}
              <h5>{pl.relay.heading}</h5>
              {relayDrafts.length > 0 ? (
                <ul>
                  {relayDrafts.map((row) => {
                    const choice = relayChoices.find((item) => item.eventId === row.relay.eventId);
                    const members = row.memberAthleteKeys
                      .filter((athleteKey): athleteKey is string => athleteKey !== null)
                      .map((athleteKey) => rosterByKey.get(athleteKey))
                      .filter((athlete): athlete is IncomingAthlete => athlete !== undefined);
                    return (
                      <li key={row.key}>
                        {choice?.eventNumber}. {choice?.disciplineKey} · {row.relay.name}: {formatSwimTime(row.relay.timeCs)}
                        {members.length > 0 && ` · ${members.map((member) => `${member.lastName}, ${member.firstName} (${member.birthYear})`).join('; ')}`}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p>{pl.export.noRelays}</p>
              )}
            </section>
            <div className="club-details-form">
              <label>
                <span>{pl.export.clubName}</span>
                <input
                  required
                  value={clubDetails.name}
                  onChange={(event) => {
                    setGeneratedDownload(null);
                    setClubDetails((current) => ({ ...current, name: event.target.value }));
                  }}
                />
              </label>
              <label>
                <span>{pl.export.contactName}</span>
                <input
                  value={clubDetails.contactName}
                  onChange={(event) => {
                    setGeneratedDownload(null);
                    setClubDetails((current) => ({ ...current, contactName: event.target.value }));
                  }}
                />
              </label>
              <label>
                <span>{pl.export.phone}</span>
                <input
                  type="tel"
                  value={clubDetails.phone}
                  onChange={(event) => {
                    setGeneratedDownload(null);
                    setClubDetails((current) => ({ ...current, phone: event.target.value }));
                  }}
                />
              </label>
              <label>
                <span>{pl.export.email}</span>
                <input
                  type="email"
                  value={clubDetails.email}
                  onChange={(event) => {
                    setGeneratedDownload(null);
                    setClubDetails((current) => ({ ...current, email: event.target.value }));
                  }}
                />
              </label>
            </div>
            {generationError && (
              <div className="form-error" role="alert">
                <p>{generationError}</p>
                {generationDiagnostic && (
                  <details>
                    <summary>{pl.export.diagnosticLabel}</summary>
                    <code>{generationDiagnostic}</code>
                  </details>
                )}
              </div>
            )}
            <button
              className="generate-button"
              type="button"
              disabled={!clubDetails.name.trim() || totalSelectedEntryCount === 0}
              onClick={generateEntryFile}
            >
              {pl.export.download}
            </button>
            {generatedDownload && (
              <p className="download-ready" role="status">
                {pl.export.fileReady}{' '}
                <a href={generatedDownload.url} download={generatedDownload.fileName}>
                  {generatedDownload.fileName}
                </a>
              </p>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
