const ESCAPED_UNICODE_PATTERN = /\\+u([0-9a-fA-F]{4})/g;
const LEADING_BARE_UNICODE_PATTERN = /^u([0-9a-fA-F]{4})(?=(?:\\+u[0-9a-fA-F]{4}|\\+[nrt]|$))/;
const ESCAPED_CONTROL_PATTERN = /\\+[nrt]|\\+["']/;
const CJK_OR_FULLWIDTH_PATTERN = /[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const NON_ASCII_PATTERN = /[^\x00-\x7f]/;

export function normalizeEscapedDisplayText(text: string): string {
  if (!text) {
    return text;
  }

  const unicodeEscapes = text.match(ESCAPED_UNICODE_PATTERN) ?? [];
  const hasLeadingBareUnicode = LEADING_BARE_UNICODE_PATTERN.test(text);
  if (unicodeEscapes.length === 0 && !hasLeadingBareUnicode) {
    return text;
  }

  const decoded = decodeEscapedDisplayText(text);
  if (decoded === text) {
    return text;
  }

  if (CJK_OR_FULLWIDTH_PATTERN.test(decoded)) {
    return decoded;
  }

  if (unicodeEscapes.length >= 2 && NON_ASCII_PATTERN.test(decoded)) {
    return decoded;
  }

  if (ESCAPED_CONTROL_PATTERN.test(text) && NON_ASCII_PATTERN.test(decoded)) {
    return decoded;
  }

  return text;
}

function decodeEscapedDisplayText(text: string): string {
  return text
    .replace(LEADING_BARE_UNICODE_PATTERN, (_match, hex: string) => fromHexCodeUnit(hex))
    .replace(ESCAPED_UNICODE_PATTERN, (_match, hex: string) => fromHexCodeUnit(hex))
    .replace(/\\+r\\+n/g, '\n')
    .replace(/\\+n/g, '\n')
    .replace(/\\+r/g, '\n')
    .replace(/\\+t/g, '\t')
    .replace(/\\+"/g, '"')
    .replace(/\\+'/g, "'");
}

function fromHexCodeUnit(hex: string): string {
  return String.fromCharCode(Number.parseInt(hex, 16));
}
