const windows1250Decoder = new TextDecoder('windows-1250');
const replacementByte = 0x3f;
const windows1250ByteByCharacter = createWindows1250ByteMap();

function createWindows1250ByteMap(): Map<string, number> {
  const byteByCharacter = new Map<string, number>();

  for (let byte = 0; byte <= 0xff; byte += 1) {
    const character = windows1250Decoder.decode(Uint8Array.of(byte));
    if (character !== '\ufffd' && !byteByCharacter.has(character)) {
      byteByCharacter.set(character, byte);
    }
  }

  return byteByCharacter;
}

export function encodeWindows1250(value: string): Uint8Array {
  const bytes: number[] = [];

  for (const character of value) {
    bytes.push(windows1250ByteByCharacter.get(character) ?? replacementByte);
  }

  return Uint8Array.from(bytes);
}

export function decodeWindows1250(bytes: Uint8Array): string {
  return windows1250Decoder.decode(bytes);
}
