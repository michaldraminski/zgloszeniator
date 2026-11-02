import { unzipSync } from 'fflate';

import { decodeWindows1250 } from './encoding';

export class LenexContainerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LenexContainerError';
  }
}

export interface LenexXmlFile {
  fileName: string;
  xml: string;
}

function decodeXml(bytes: Uint8Array): string {
  const prefix = Array.from(bytes.subarray(0, 256), (byte) => String.fromCharCode(byte)).join('');
  const declaredEncoding = /<\?xml[^>]*\bencoding\s*=\s*["']([^"']+)["']/i.exec(prefix)?.[1];
  const encoding = declaredEncoding?.trim().toLowerCase().replaceAll('_', '-') ?? 'utf-8';

  if (encoding === 'windows-1250' || encoding === 'cp1250') {
    return decodeWindows1250(bytes);
  }
  if (encoding === 'utf-8' || encoding === 'utf8') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new LenexContainerError('LENEX file contains invalid UTF-8 data');
    }
  }

  throw new LenexContainerError(`Unsupported XML encoding: ${declaredEncoding}`);
}

function isZip(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

export function readLxf(bytes: Uint8Array): LenexXmlFile {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new LenexContainerError('Invalid LENEX ZIP archive');
  }

  const lenexFiles = Object.entries(files).filter(([fileName]) => /\.lef$/i.test(fileName));
  if (lenexFiles.length !== 1) {
    throw new LenexContainerError('LENEX archive must contain exactly one .lef file');
  }

  const [fileName, xmlBytes] = lenexFiles[0];
  return { fileName, xml: decodeXml(xmlBytes) };
}

export function readLenexFile(fileName: string, bytes: Uint8Array): LenexXmlFile {
  if (isZip(bytes)) {
    const extracted = readLxf(bytes);
    return { fileName, xml: extracted.xml };
  }

  return { fileName, xml: decodeXml(bytes) };
}
