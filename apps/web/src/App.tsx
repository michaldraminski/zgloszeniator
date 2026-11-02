import { useState } from 'react';

import {
  collectImportedHistory,
  parseLenexDocument,
  readLenexFile,
  type Meet,
  type ParsedLenexDocument,
} from '@lenex-entries/core';

import { pl } from './i18n/pl';

type InvitationImportState =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'loaded'; fileName: string; meet: Meet }
  | { kind: 'error'; fileName: string; reason: 'invalid' | 'wrong-type' };

type HistoricalDocument = Exclude<ParsedLenexDocument, { kind: 'invitation' }>;

interface HistoricalFile {
  fileName: string;
  document: HistoricalDocument;
}

interface RejectedHistoryFile {
  fileName: string;
  reason: 'invalid' | 'wrong-type';
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

export default function App() {
  const [invitationState, setInvitationState] = useState<InvitationImportState>({ kind: 'idle' });
  const [historicalFiles, setHistoricalFiles] = useState<HistoricalFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [rejectedHistoryFiles, setRejectedHistoryFiles] = useState<RejectedHistoryFile[]>([]);
  const importedHistory = collectImportedHistory(historicalFiles.map(({ document }) => document));
  const entryObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'entry',
  ).length;
  const resultObservationCount = importedHistory.observations.filter(
    (item) => item.source.kind === 'result',
  ).length;

  async function loadInvitation(file: File): Promise<void> {
    setInvitationState({ kind: 'loading', fileName: file.name });

    try {
      const document = await parseFile(file);
      if (document.kind !== 'invitation') {
        setInvitationState({ kind: 'error', fileName: file.name, reason: 'wrong-type' });
        return;
      }
      setInvitationState({ kind: 'loaded', fileName: file.name, meet: document.meet });
    } catch {
      setInvitationState({ kind: 'error', fileName: file.name, reason: 'invalid' });
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
      } catch {
        rejected.push({ fileName: file.name, reason: 'invalid' });
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
              <p key={`${file.fileName}-${index}`}>
                {file.fileName}: {file.reason === 'wrong-type'
                  ? pl.fileImport.expectedHistory
                  : pl.fileImport.errorFallback}
              </p>
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
    </main>
  );
}
