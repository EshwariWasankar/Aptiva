import type { PatternRecordDraft, RejectedRow } from '../types.js';

export const DS07_PARSER_VERSION = 'ds07-v1';

/**
 * DS-07 parser — abhishukla0807-dev/preperation-hub.
 *
 * Reads Companies/<NN-Name>/0*-OA.md files at a pinned commit and emits
 * one PatternRecordDraft per section/topic statement (Section 14.1:
 * structure only — no recalled questions, no long passages). Sections
 * come from top-level markdown headings; topic_text from bullet items
 * inside each section. Counts, minutes, negative marking and difficulty
 * notes are captured only where the text actually states them.
 */

/** Headings that are navigation/meta, never assessment sections. */
const META_HEADINGS = new Set([
  'table of contents',
  'overview',
  'assessment pattern',
  'skills tested',
  'preparation strategy',
  'preparation roadmap',
  'programming tips',
  'common mistakes',
  'frequently asked questions',
  'faqs',
  'resources',
]);

function cleanInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

function isBullet(line: string): string | null {
  const m = line.match(/^\s*[-*•]\s+(.+)$/);
  return m ? cleanInline(m[1]!) : null;
}

/** Extract "N questions/items" and "N minutes/min" ints near a text span. */
function statedInt(text: string, unitRe: RegExp): number | null {
  const m = text.match(new RegExp(`(\\d[\\d,]*)\\s*(?:${unitRe.source})`, 'i'));
  if (!m) return null;
  const v = Number(m[1]!.replace(/,/g, ''));
  return Number.isFinite(v) ? v : null;
}

const NEG_RE = /negative\s+mark(?:ing)?[^\n.]{0,40}/i;

interface SectionBlock {
  name: string;
  body: string;
}

/** Split markdown into top-level (#) sections, skipping the title block. */
function splitSections(markdown: string): { title: string | null; sections: SectionBlock[] } {
  const lines = markdown.split('\n');
  const sections: SectionBlock[] = [];
  let title: string | null = null;
  let current: SectionBlock | null = null;

  for (const line of lines) {
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) {
      const name = cleanInline(h1[1]!);
      if (!title) {
        title = name;
        continue;
      }
      const key = name.toLowerCase();
      if (META_HEADINGS.has(key)) {
        current = null;
        continue;
      }
      current = { name, body: '' };
      sections.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  return { title, sections };
}

/** Section → difficulty stars from the "Assessment Pattern" table. */
function difficultyNotes(markdown: string): Map<string, string> {
  const notes = new Map<string, string>();
  for (const m of markdown.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)) {
    const name = cleanInline(m[1]!).toLowerCase();
    const cell = m[2]!;
    const stars = cell.match(/⭐+/)?.[0];
    if (stars) notes.set(name, `${stars.length}/4`);
  }
  return notes;
}

export interface Ds07ParseResult {
  records: PatternRecordDraft[];
  rejected: RejectedRow[];
}

export function parseDs07File(path: string, content: string): Ds07ParseResult {
  const records: PatternRecordDraft[] = [];
  const rejected: RejectedRow[] = [];

  const companyMatch = path.match(/Companies\/\d+-(.+?)\//i);
  const company = companyMatch ? companyMatch[1]!.trim() : (path.split('/')[1] ?? 'unknown');
  const isOaFile = /0\d-OA\.md$/i.test(path);
  if (!isOaFile) {
    // Only OA files carry assessment structure; README/Technical/HR/Experiences are out of scope.
    return { records, rejected };
  }

  if (!content.trim()) {
    rejected.push({ sourcePath: path, reason: 'empty file' });
    return { records, rejected };
  }

  const { sections } = splitSections(content);
  const notes = difficultyNotes(content);
  const roundName = 'Online Assessment';
  const fileLevelNeg = content.match(NEG_RE)?.[0]?.trim() ?? null;
  const fileMinutes = statedInt(content, /minutes?|mins?\b/i);
  const fileCount = statedInt(content, /questions?|items?\b/i);

  let emitted = 0;
  for (const sec of sections) {
    const bullets = sec.body
      .split('\n')
      .map(isBullet)
      .filter((b): b is string => b !== null && b.length > 1 && b.length < 120);
    // One section-level record always (the section itself is a statement).
    records.push({
      company,
      roundName,
      sectionName: sec.name,
      topicText: null,
      questionCount: fileCount,
      minutes: fileMinutes,
      negativeMarking: fileLevelNeg,
      difficultyNote: notes.get(sec.name.toLowerCase()) ?? null,
      sourcePath: path,
    });
    emitted += 1;
    for (const topic of bullets) {
      records.push({
        company,
        roundName,
        sectionName: sec.name,
        topicText: topic,
        questionCount: null,
        minutes: null,
        negativeMarking: null,
        difficultyNote: null,
        sourcePath: path,
      });
      emitted += 1;
    }
  }

  if (emitted === 0) {
    rejected.push({ sourcePath: path, reason: 'no assessment sections found in OA file' });
  }
  return { records, rejected };
}
