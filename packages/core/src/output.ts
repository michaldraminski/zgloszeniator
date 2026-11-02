export type OutputFormat = 'lenex2-windows1250' | 'lenex3-utf8';

export const DEFAULT_OUTPUT_FORMAT: OutputFormat = 'lenex2-windows1250';

export function normalizeOutputFormat(value?: string | null): OutputFormat {
  switch (value) {
    case 'lenex3-utf8':
      return 'lenex3-utf8';
    case 'lenex2-windows1250':
    case undefined:
    case null:
    default:
      return DEFAULT_OUTPUT_FORMAT;
  }
}
