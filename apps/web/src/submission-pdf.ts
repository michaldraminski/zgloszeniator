import {
  addVirtualFileSystem,
  createPdf,
} from 'pdfmake/build/pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import pdfFonts from 'pdfmake/build/vfs_fonts';

export interface SubmissionPdfEntry {
  athleteName: string;
  birthYear: number;
  eventLabel: string;
  time: string;
}

export interface SubmissionPdfRelay {
  eventLabel: string;
  relayName: string;
  time: string;
  members: string[];
}

export interface SubmissionPdfContent {
  meetName: string;
  clubName: string;
  heading: string;
  individualHeading: string;
  relayHeading: string;
  missingTimeLabel: string;
  noEntriesLabel: string;
  noRelaysLabel: string;
  footer: string;
  openPdfLabel: string;
  downloadPdfLabel: string;
  entries: SubmissionPdfEntry[];
  relays: SubmissionPdfRelay[];
}

export function buildSubmissionPdfDefinition(input: SubmissionPdfContent): TDocumentDefinitions {
  const content: Content[] = [
    { text: input.heading, style: 'title' },
    { text: input.meetName, style: 'meet' },
    { text: input.clubName, style: 'club', margin: [0, 0, 0, 14] },
    { text: input.individualHeading, style: 'section' },
  ];

  if (input.entries.length === 0) {
    content.push({ text: input.noEntriesLabel, color: '#64748b', margin: [0, 0, 0, 10] });
  } else {
    for (const entry of input.entries) {
      content.push({
        text: [
          { text: `${entry.athleteName} (${entry.birthYear})`, bold: true },
          { text: `  ·  ${entry.eventLabel}  ·  ${entry.time || input.missingTimeLabel}` },
        ],
        margin: [0, 0, 0, 5],
      });
    }
  }

  content.push({ text: input.relayHeading, style: 'section', margin: [0, 12, 0, 5] });
  if (input.relays.length === 0) {
    content.push({ text: input.noRelaysLabel, color: '#64748b' });
  } else {
    for (const relay of input.relays) {
      content.push({
        text: [
          { text: `${relay.eventLabel}  ·  ${relay.relayName}`, bold: true },
          { text: `  ·  ${relay.time}` },
          ...(relay.members.length > 0 ? [{ text: `\n${relay.members.join('; ')}`, color: '#475569' }] : []),
        ],
        margin: [0, 0, 0, 8],
      });
    }
  }

  content.push({ text: input.footer, style: 'footer', margin: [0, 18, 0, 0] });

  return {
    info: {
      title: `${input.heading} — ${input.meetName}`,
      author: 'Zgłoszeniator',
      subject: 'Lokalne podsumowanie zgłoszenia zawodów',
    },
    pageSize: 'A4',
    pageMargins: [42, 44, 42, 44],
    content,
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
    styles: {
      title: { fontSize: 20, bold: true, color: '#1d4ed8', margin: [0, 0, 0, 7] },
      meet: { fontSize: 14, bold: true, margin: [0, 0, 0, 3] },
      club: { fontSize: 11, color: '#475569' },
      section: { fontSize: 12, bold: true, color: '#1e3a8a', margin: [0, 7, 0, 7] },
      footer: { fontSize: 8, color: '#64748b' },
    },
  };
}

let virtualFontsRegistered = false;

interface CallbackPdfDocument {
  getBlob(callback: (blob: Blob) => void): void;
}

export function openSubmissionPdf(input: SubmissionPdfContent, popup: Window): Promise<void> {
  if (!virtualFontsRegistered) {
    addVirtualFileSystem(pdfFonts);
    virtualFontsRegistered = true;
  }
  return new Promise((resolve, reject) => {
    try {
      const pdf = createPdf(buildSubmissionPdfDefinition(input)) as unknown as CallbackPdfDocument;
      pdf.getBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const toolbar = popup.document.createElement('nav');
        toolbar.setAttribute('aria-label', 'Opcje podsumowania PDF');
        toolbar.style.cssText = 'box-sizing:border-box;display:flex;align-items:center;gap:16px;height:52px;padding:8px 14px;font:14px Arial,sans-serif;background:#f8fafc;border-bottom:1px solid #cbd5e1';

        const openLink = popup.document.createElement('a');
        openLink.href = url;
        openLink.target = '_self';
        openLink.textContent = input.openPdfLabel;

        const downloadLink = popup.document.createElement('a');
        downloadLink.href = url;
        downloadLink.download = 'podsumowanie-zgloszenia.pdf';
        downloadLink.textContent = input.downloadPdfLabel;

        toolbar.append(openLink, downloadLink);
        const frame = popup.document.createElement('iframe');
        frame.title = 'Podsumowanie PDF';
        frame.src = url;
        frame.style.cssText = 'border:0;width:100%;height:calc(100% - 52px);position:fixed;inset:52px 0 0';
        popup.document.title = input.heading;
        popup.document.body.style.margin = '0';
        popup.document.documentElement.style.height = '100%';
        popup.document.body.style.height = '100%';
        popup.document.body.append(toolbar, frame);
        resolve();
      });
    } catch (error) {
      popup.close();
      reject(error);
    }
  });
}
