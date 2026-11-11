import { createHash } from 'node:crypto';

/**
 * Normalisation shared by parsers and the dedupe stage. Must stay
 * byte-identical to the API-side stemHash (apps/api/src/common/sanitize.ts)
 * so imported items dedupe against admin-created ones: strip markup to
 * text, collapse whitespace, trim, lowercase — punctuation preserved.
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === '#') {
      const code =
        ent[1] === 'x' || ent[1] === 'X'
          ? Number.parseInt(ent.slice(2), 16)
          : Number.parseInt(ent.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

/** Strip HTML tags the way sanitize-html's text mode does (tags removed, not spaced). */
export function stripHtml(text: string): string {
  return decodeEntities(text.replace(/<[^>]*>/g, ''));
}

export function normaliseStem(text: string): string {
  return stripHtml(text).replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stemHash(text: string): string {
  return createHash('sha256').update(normaliseStem(text)).digest('hex');
}

/** Parse a numeric answer literal: integers, decimals, simple fractions, percentages. */
export function parseAnswerLiteral(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (!s) return null;
  // "1/4" or "3/2" simple fraction (a colon ratio "4 : 3" does not match).
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const d = Number(frac[2]);
    if (d === 0) return null;
    return Number(frac[1]) / d;
  }
  const pct = s.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
  const num = pct ? pct[1]! : s;
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(num)) return null;
  const v = Number.parseFloat(num);
  return Number.isFinite(v) ? v : null;
}

/** Absolute tolerance for imported numerical keys: 0.5% of the answer, min 0.001. */
export function defaultTolerance(answer: number): number {
  return Math.max(0.001, Math.abs(answer) * 0.005);
}

export function decimalPlacesOf(value: number): number {
  const s = String(value);
  const i = s.indexOf('.');
  if (i === -1 || s.includes('e')) return 0;
  return Math.min(6, s.length - i - 1);
}
