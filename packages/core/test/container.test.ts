import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { encodeWindows1250 } from '../src/encoding';
import { readLenexFile, readLxf } from '../src/container';
import { detectLenexType } from '../src/lenex';

const plainXml = '<?xml version="1.0" encoding="UTF-8"?><LENEX />';

describe('LENEX file containers', () => {
  it('reads a raw UTF-8 .lef document', () => {
    const bytes = new TextEncoder().encode(plainXml);

    expect(readLenexFile('invitation.lef', bytes)).toEqual({
      fileName: 'invitation.lef',
      xml: plainXml,
    });
  });

  it('extracts the single .lef from an .lxf ZIP regardless of its inner filename', () => {
    const bytes = zipSync({ 'unexpected-name.lef': new TextEncoder().encode(plainXml) });

    expect(readLxf(bytes)).toEqual({ fileName: 'unexpected-name.lef', xml: plainXml });
    expect(readLenexFile('upload.lxf', bytes)).toEqual({ fileName: 'upload.lxf', xml: plainXml });
  });

  it('decodes Windows-1250 when declared by XML', () => {
    const original = '<?xml version="1.0" encoding="Windows-1250"?><LENEX note="Łódź" />';
    const bytes = encodeWindows1250(original);

    expect(readLenexFile('legacy.lef', bytes).xml).toBe(original);
  });

  it('rejects invalid archives and archives without exactly one .lef file', () => {
    expect(() => readLxf(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toThrow(
      'Invalid LENEX ZIP archive',
    );
    expect(() => readLxf(zipSync({ 'readme.txt': new Uint8Array() }))).toThrow(
      'LENEX archive must contain exactly one .lef file',
    );
    expect(
      () => readLxf(zipSync({ 'one.lef': new Uint8Array(), 'two.lef': new Uint8Array() })),
    ).toThrow('LENEX archive must contain exactly one .lef file');
  });
});

describe('LENEX document detection', () => {
  it('classifies by document content rather than filename', () => {
    expect(detectLenexType('<LENEX><MEETS><MEET><CLUBS><CLUB><ATHLETES><ATHLETE><RESULTS><RESULT /></RESULTS></ATHLETE></ATHLETES></CLUB></CLUBS></MEET></MEETS></LENEX>')).toBe('results');
    expect(detectLenexType('<LENEX><MEETS><MEET><CLUBS><CLUB><ATHLETES><ATHLETE><ENTRIES><ENTRY /></ENTRIES></ATHLETE></ATHLETES></CLUB></CLUBS></MEET></MEETS></LENEX>')).toBe('entry');
    expect(detectLenexType('<LENEX><MEETS><MEET /></MEETS></LENEX>')).toBe('invitation');
  });
});