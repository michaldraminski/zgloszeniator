import { useState } from 'react';

import {
  buildAthleteEventOptions,
  collectImportedHistory,
  formatTime,
  parseTime,
  parseLenexDocument,
  readLenexFile,
  type AthleteEntryOptions,
  type AthleteEventOption,
  type Meet,
  type ParsedLenexDocument,
} from '@lenex-entries/core';

import { pl } from './i18n/pl';

type InvitationImportState =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'loaded'; fileName: string; meet: Meet }
  | { kind: 'error'; fileName: string; reason: 'invalid' | 'wrong-type'; diagnostic?: string };

type HistoricalDocument = Exclude<ParsedLenexDocument, { kind: 'invitation' }>;

interface HistoricalFile {
  fileName: string;
  document: HistoricalDocument;
}

interface RejectedHistoryFile {
  fileName: string;
  reason: 'invalid' | 'wrong-type';
  diagnostic?: string;
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
      ].join(' · ');
  }
}

function getSuggestedTimeLabel(option: AthleteEventOption): string {
  const suggestion = option.suggestedTime;
  if (!suggestion) {
    return pl.fileImport.manualTimeHint;
  }

  const sourceLabel =
    suggestion.source.kind === 'result' ? pl.fileImport.resultSource : pl.fileImport.entrySource;
  const recency = suggestion.source.meetDate
    ? `${pl.fileImport.importedDate}: ${suggestion.source.meetDate}`
    : pl.fileImport.importOrder;
  return `${sourceLabel} · ${suggestion.source.meetName} · ${recency}`;
}

export default function App() {
  const [invitationState, setInvitationState] = useState<InvitationImportState>({ kind: 'idle' });
  const [historicalFiles, setHistoricalFiles] = useState<HistoricalFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rejectedHistoryFiles, setRejectedHistoryFiles] = useState<RejectedHistoryFile[]>([]);
  const importedHistory = collectImportedHistory(historicalFiles.map(({ document }) => document));
  const entryOptions =
    invitationState.kind === 'loaded'
      ? buildAthleteEventOptions(invitationState.meet, importedHistory)
      : [];
  const [selectedAthleteKeys, setSelectedAthleteKeys] = useState<string[]>([]);
  const [selectedEventIds, setSelectedEventIds] = useState<Record<string, string[]>>({});
  const [editedTimes, setEditedTimes] = useState<Record<string, Record<string, string>>>({});
  const entryObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'entry',
  ).length;
  const resultObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'result',
  ).length;
  const selectedAthletes = entryOptions.filter((option) =>
    selectedAthleteKeys.includes(option.athleteKey),
  );
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

  function isEventSelected(athlete: AthleteEntryOptions, option: AthleteEventOption): boolean {
    return (selectedEventIds[athlete.athleteKey] ??
      athlete.events
        .filter((candidate) => candidate.suggestedTime)
        .map((candidate) => candidate.event.eventId)
    ).includes(option.event.eventId);
  }

  function toggleEvent(athlete: AthleteEntryOptions, eventId: string, checked: boolean): void {
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
    setEditedTimes((current) => ({
      ...current,
      [athleteKey]: { ...current[athleteKey], [eventId]: value },
    }));
  }

  async function loadInvitation(file: File): Promise<void> {
    setInvitationState({ kind: 'loading', fileName: file.name });

    try {
      const document = await parseFile(file);
      if (document.kind !== 'invitation') {
        setInvitationState({ kind: 'error', fileName: file.name, reason: 'wrong-type' });
        return;
      }
      setSelectedAthleteKeys([]);
      setSelectedEventIds({});
      setEditedTimes({});
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
    const accepted: HistoricalFile[] = [];
    const rejected: RejectedHistoryFile[] = [];

    for (const file of files) {
      try {
        const document = await parseFile(file);
        if (document.kind === 'invitation') {
          rejected.push({ fileName: file.name, reason: 'wrong-type' });
        } else {
          accepted.push({ fileName: file.name, document });
        }
      } catch (error) {
        rejected.push({
          fileName: file.name,
          reason: 'invalid',
          ...(error instanceof Error ? { diagnostic: error.message } : {}),
        });
      }
    }

    setHistoricalFiles((current) => [...current, ...accepted]);
    setRejectedHistoryFiles(rejected);
    setHistoryLoading(false);
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Lenex Entries</p>
        <h1>{pl.title}</h1>
      </header>

      <section className="panel">
        <h2>{pl.sections.roster}</h2>
        <p>{pl.appDescription}</p>
      </section>

      <section className="panel">
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
            disabled={invitationState.kind === 'loading'}
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
          </div>
        )}

        <hr />

        <h3>{pl.fileImport.historyHeading}</h3>
        <p>{pl.fileImport.historyHint}</p>
        <p className="privacy-note">{pl.fileImport.localOnlyHint}</p>
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
            disabled={invitationState.kind !== 'loaded' || historyLoading}
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
            <h4>{pl.fileImport.historyImported}</h4>
            <ul>
              {historicalFiles.map(({ fileName, document }, index) => (
                <li key={`${fileName}-${index}`}>
                  {getDocumentLabel(document)} — {fileName}: {getDocumentSummary(document)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {invitationState.kind === 'loaded' && historicalFiles.length > 0 && (
        <section className="panel entry-planner">
          <div className="entry-planner-header">
            <div>
              <h2>{pl.fileImport.selectionHeading}</h2>
              <p>{invitationState.meet.name}</p>
            </div>
            <p className="selection-counts">
              {pl.fileImport.selectedAthletes}: {selectedAthletes.length} ·{' '}
              {pl.fileImport.selectedEntries}: {selectedEntryCount}
            </p>
          </div>

          {entryOptions.length === 0 ? (
            <p>{pl.fileImport.noAthletes}</p>
          ) : (
            <>
              <div className="selection-actions">
                <button
                  type="button"
                  onClick={() => setSelectedAthleteKeys(entryOptions.map((option) => option.athleteKey))}
                >
                  {pl.fileImport.selectAllAthletes}
                </button>
                <button type="button" onClick={() => setSelectedAthleteKeys([])}>
                  {pl.fileImport.clearAthletes}
                </button>
              </div>

              <div className="entry-planner-grid">
                <div className="athlete-list" aria-label={pl.fileImport.athleteListLabel}>
                  {entryOptions.map((athlete) => (
                    <label className="athlete-choice" key={athlete.athleteKey}>
                      <input
                        type="checkbox"
                        checked={selectedAthleteKeys.includes(athlete.athleteKey)}
                        onChange={(event) => {
                          setSelectedAthleteKeys((current) =>
                            event.target.checked
                              ? [...current, athlete.athleteKey]
                              : current.filter((key) => key !== athlete.athleteKey),
                          );
                        }}
                      />
                      <span>
                        {athlete.athlete.lastName}, {athlete.athlete.firstName}
                        <small>{athlete.age} {pl.fileImport.ageSuffix}</small>
                      </span>
                    </label>
                  ))}
                </div>

                <div className="athlete-entry-options">
                  {selectedAthletes.map((athlete) => (
                    <fieldset className="athlete-entry-card" key={athlete.athleteKey}>
                      <legend>
                        {athlete.athlete.lastName}, {athlete.athlete.firstName}
                      </legend>
                      {athlete.events.length === 0 ? (
                        <p>{pl.fileImport.noEligibleEvents}</p>
                      ) : (
                        <div className="discipline-options">
                          {athlete.events.map((option) => {
                            const eventId = option.event.eventId;
                            const checked = isEventSelected(athlete, option);
                            const value = editedTimes[athlete.athleteKey]?.[eventId] ??
                              (option.suggestedTime
                                ? formatTime(option.suggestedTime.timeCs)
                                : '');
                            const invalidTime = value.length > 0 && parseTime(value) === null;

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
                                <input
                                  className={invalidTime ? 'time-input time-input-invalid' : 'time-input'}
                                  type="text"
                                  inputMode="decimal"
                                  aria-invalid={invalidTime}
                                  aria-label={`${pl.fileImport.timeFor} ${option.event.disciplineKey} — ${athlete.athlete.lastName}`}
                                  placeholder="00:00:00.00"
                                  value={value}
                                  disabled={!checked}
                                  onChange={(event) =>
                                    updateTime(athlete.athleteKey, eventId, event.target.value)
                                  }
                                />
                                <small className="time-source">
                                  {getSuggestedTimeLabel(option)}
                                </small>
                                {invalidTime && (
                                  <small className="time-error">{pl.fileImport.invalidTime}</small>
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
        </section>
      )}
    </main>
  );
}
