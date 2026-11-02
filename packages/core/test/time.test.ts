import { describe, expect, it } from 'vitest';

import { decodeWindows1250, encodeWindows1250, formatTime, parseTime } from '../src/index';

describe('time utilities', () => {
  it('parses and formats a swimming time', () => {
    expect(parseTime('00:04:23.33')).toBe(26333);
    expect(formatTime(26333)).toBe('00:04:23.33');
  });

  it('rejects malformed times', () => {
    expect(parseTime('invalid')).toBeNull();
    expect(parseTime('00:04:23')).toBeNull();
  });

  it('round-trips accented characters with Windows-1250 encoding', () => {
    const text = 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻ';
    const bytes = encodeWindows1250(text);

    expect(decodeWindows1250(bytes)).toBe(text);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
