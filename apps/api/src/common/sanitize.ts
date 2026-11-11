import sanitizeHtml from 'sanitize-html';
import { createHash } from 'node:crypto';

/**
 * Server-side HTML sanitisation for admin-authored content (PH2-T04,
 * T-020 XSS). Question stems/solutions and lesson content may contain a
 * small safe subset of HTML; everything else — scripts, event handlers,
 * javascript: URLs — is stripped before persistence.
 */
const ALLOWED_TAGS = [
  'p',
  'br',
  'b',
  'strong',
  'i',
  'em',
  'u',
  'sub',
  'sup',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'h1',
  'h2',
  'h3',
  'h4',
  'code',
  'pre',
  'span',
  'div',
];

const ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
  td: ['colspan', 'rowspan'],
  th: ['colspan', 'rowspan'],
};

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ['http', 'https', 'mailto'],
  });
}

/** Plain-text normalisation used for the stem_hash dedupe key. */
export function normaliseStem(stemHtml: string): string {
  const text = sanitizeHtml(stemHtml, { allowedTags: [], allowedAttributes: {} });
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stemHash(stemHtml: string): string {
  return createHash('sha256').update(normaliseStem(stemHtml)).digest('hex');
}
