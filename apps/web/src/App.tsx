import { useState } from 'react';

import {
  parseLenexDocument,
  readLenexFile,
  type ParsedLenexDocument,
} from '@lenex-entries/core';

import { pl } from './i18n/pl';

type ImportState =
  | { kind: 'idle' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'loaded'; fileName: string; document: ParsedLenexDocument }
  | { kind: 'error'; fileName: string };

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
    case 'invitation':
      return `${pl.fileImport.events}: ${document.meet.events.length} · ${pl.fileImport.disciplines}: ${new Set(document.meet.events.map((event) => event.disciplineKey)).size}`;
    case 'entry': {
      const clubs = document.entryFile.clubs;
      const athletes = clubs.flatMap((club) => club.athletes);
      const relays = clubs.flatMap((club) => club.relays);
      const entriesCount = athletes.reduce((sum, athlete) => sum + athlete.entries.length, 0);
      return `${pl.fileImport.clubs}: ${clubs.length} · ${pl.fileImport.athletes}: ${athletes.length} · ${pl.fileImport.entries}: ${entriesCount} · ${pl.fileImport.relays}: ${relays.length}`;
    }
    case 'results':
      return `${pl.fileImport.athletes}: ${document.results.athletes.length} · ${pl.fileImport.validResults}: ${document.results.validResults.length}`;
  }
}

export default function App() {
  const [importState, setImportState] = useState<ImportState>({ kind: 'idle' });

  async function loadFile(file: File): Promise<void> {
    setImportState({ kind: 'loading', fileName: file.name });

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { xml } = readLenexFile(file.name, bytes);
      const document = parseLenexDocument(xml);
      setImportState({ kind: 'loaded', fileName: file.name, document });
    } catch {
      setImportState({ kind: 'error', fileName: file.name });
    }
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
        <p>{pl.fileImport.hint}</p>
        <label className="file-picker">
          <span>{pl.fileImport.choose}</span>
          <input
            className="file-input"
            type="file"
            accept=".lxf,.lef,application/zip,application/xml,text/xml"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                void loadFile(file);
              }
            }}
          />
        </label>

        {importState.kind === 'loading' && (
          <p className="import-message" role="status">
            {pl.fileImport.loading} {importState.fileName}
          </p>
        )}

        {importState.kind === 'error' && (
          <div className="import-result import-result-error" role="alert">
            <strong>{pl.fileImport.errorHeading}</strong>
            <p>{importState.fileName}</p>
            <p>{pl.fileImport.errorFallback}</p>
          </div>
        )}

        {importState.kind === 'loaded' && (
          <div className="import-result" role="status">
            <p className="import-kind">{getDocumentLabel(importState.document)}</p>
            <h3>{
              importState.document.kind === 'invitation'
                ? importState.document.meet.name
                : importState.document.kind === 'entry'
                  ? importState.document.entryFile.meet.name
                  : importState.document.results.meet.name
            }</h3>
            <p>{importState.fileName}</p>
            <p>{getDocumentSummary(importState.document)}</p>
          </div>
        )}
      </section>

    </main>
  );
}
