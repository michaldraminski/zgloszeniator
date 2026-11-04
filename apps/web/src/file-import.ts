import type { ParsedLenexDocument } from '@lenex-entries/core';

export interface HistoricalFileInput {
  fileName: string;
  document: ParsedLenexDocument;
}

export interface UniqueHistoricalFiles {
  files: HistoricalFileInput[];
  duplicateFileNames: string[];
}

/** Ignore a document that is already imported, even if its archive/file name differs. */
export function addUniqueHistoricalFiles(
  current: readonly HistoricalFileInput[],
  incoming: readonly HistoricalFileInput[],
): UniqueHistoricalFiles {
  const fingerprints = new Set(current.map(({ document }) => JSON.stringify(document)));
  const files: HistoricalFileInput[] = [];
  const duplicateFileNames: string[] = [];

  for (const file of incoming) {
    const fingerprint = JSON.stringify(file.document);
    if (fingerprints.has(fingerprint)) {
      duplicateFileNames.push(file.fileName);
      continue;
    }
    fingerprints.add(fingerprint);
    files.push(file);
  }

  return { files, duplicateFileNames };
}
