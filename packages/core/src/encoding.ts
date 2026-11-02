import { decode, encode } from 'iconv-lite';

export function encodeWindows1250(value: string): Uint8Array {
  return Uint8Array.from(encode(value, 'windows-1250'));
}

export function decodeWindows1250(bytes: Uint8Array): string {
  return decode(Buffer.from(bytes), 'windows-1250');
}
