import type { ParsedItem, RejectedRow } from '../types.js';
import { decimalPlacesOf, defaultTolerance, parseAnswerLiteral } from '../normalize.js';

export const DS01_PARSER_VERSION = 'ds01-v1';

/**
 * DS-01 parser — drsarveshwarbharti/Aptitude-For-Placements.
 *
 * Actual format (verified against the repo, not the playbook's MCQ
 * assumption): each file is "<Topic>-N - Placement Exercise", a NOTE
 * preamble, a "Problem:" block, a "Solution:" worked solution, and a
 * "Final Answer" block. These are free-response aptitude problems, so
 * they import as `numerical` items when the final answer is a parseable
 * number/fraction/percentage; everything else is rejected with a reason
 * (reported in the dry-run, never silently dropped).
 */

// "Problem:"/"Solution:" with colon, or the bare word alone on a line
// (Profit & Loss files omit the colon).
const PROBLEM_RE = /^Problem(?:\s*:|\s*$)/im;
const SOLUTION_RE = /^Solution(?:\s*:|\s*$)/im;
const FINAL_RE = /Final\s+Answer\s*:?/i;

function section(text: string, start: RegExp, end: RegExp): string | null {
  const s = text.search(start);
  if (s === -1) return null;
  const rest = text.slice(s);
  const m = rest.match(end);
  const body = m ? rest.slice(0, m.index) : rest;
  return body.replace(start, '').trim();
}

/** Ratios like "4 : 3" or "4:3" are not a single numerical key. */
function looksLikeRatio(finalBlock: string): boolean {
  return /\d\s*:\s*\d/.test(finalBlock);
}

/** Multi-part answers like "(a) ... (b) ..." can't be a single key → reject. */
function looksMultiPart(finalBlock: string): boolean {
  return /^\s*\([a-z]\)/im.test(finalBlock) || /\([a-z]\)\s*[^\n]*\([a-z]\)/i.test(finalBlock);
}

/**
 * Pull the most likely numeric answer out of the Final Answer block.
 * Preference order per line (bottom-up): value after the last "=",
 * a percentage literal, then a lone numeric literal. Lines with several
 * bare numbers and no anchor are skipped — the answer is usually the
 * anchored or percentage one (e.g. "42 kg is 12.5% of 336 kg" → 12.5).
 */
function extractNumericAnswer(finalBlock: string): { value: number; literal: string } | null {
  const lines = finalBlock
    .split('\n')
    .map((l) => l.replace(/^[\s\-\u{1F44D}\u{1F449}*>#]+/u, '').trim())
    .filter((l) => l.length > 0);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]!;
    const eq = line.lastIndexOf('=');
    if (eq !== -1) {
      const tail = line.slice(eq + 1).trim();
      const first = tail.match(/-?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*-?\d[\d,]*(?:\.\d+)?)?\s*%?/);
      if (first) {
        const v = parseAnswerLiteral(first[0]);
        if (v !== null) return { value: v, literal: first[0] };
      }
    }
    const candidates = line.match(/-?\d[\d,]*(?:\.\d+)?(?:\s*\/\s*-?\d[\d,]*(?:\.\d+)?)?\s*%?/g);
    if (!candidates) continue;
    // Prefer a percentage literal.
    for (const c of candidates) {
      if (c.includes('%')) {
        const v = parseAnswerLiteral(c);
        if (v !== null) return { value: v, literal: c };
      }
    }
    // A lone candidate on the line is safe.
    if (candidates.length === 1) {
      const v = parseAnswerLiteral(candidates[0]!);
      if (v !== null) return { value: v, literal: candidates[0]! };
    }
  }
  return null;
}

export interface Ds01ParseResult {
  items: ParsedItem[];
  rejected: RejectedRow[];
}

export function parseDs01File(path: string, content: string): Ds01ParseResult {
  const items: ParsedItem[] = [];
  const rejected: RejectedRow[] = [];
  const topicHint = path.split('/')[0] ?? null;

  const problem = section(content, PROBLEM_RE, SOLUTION_RE);
  const solution = section(content, SOLUTION_RE, FINAL_RE);
  const finalMatch = content.match(FINAL_RE);
  const finalBlock = finalMatch
    ? content.slice(finalMatch.index! + finalMatch[0].length).trim()
    : null;

  if (!problem) {
    rejected.push({ sourcePath: path, reason: 'no Problem: section found' });
    return { items, rejected };
  }
  if (!solution) {
    rejected.push({ sourcePath: path, reason: 'no Solution: section found' });
    return { items, rejected };
  }
  if (!finalBlock) {
    rejected.push({ sourcePath: path, reason: 'no Final Answer section found' });
    return { items, rejected };
  }
  if ((problem.match(/^Problem(?:\s*:|\s*$)/gim) ?? []).length > 0) {
    rejected.push({ sourcePath: path, reason: 'multiple Problem: sections in one file' });
    return { items, rejected };
  }

  const stem = problem.replace(/\s+/g, ' ').trim();
  if (stem.length < 10) {
    rejected.push({ sourcePath: path, reason: 'stem too short after normalisation' });
    return { items, rejected };
  }
  if (looksMultiPart(finalBlock)) {
    rejected.push({
      sourcePath: path,
      reason: 'multi-part final answer cannot map to a single numerical key',
      excerpt: finalBlock.slice(0, 120),
    });
    return { items, rejected };
  }
  if (looksLikeRatio(finalBlock)) {
    rejected.push({
      sourcePath: path,
      reason: 'ratio final answer cannot map to a single numerical key',
      excerpt: finalBlock.slice(0, 120),
    });
    return { items, rejected };
  }

  const answer = extractNumericAnswer(finalBlock);
  if (!answer) {
    rejected.push({
      sourcePath: path,
      reason: 'final answer is not a parseable number/fraction/percentage',
      excerpt: finalBlock.slice(0, 160),
    });
    return { items, rejected };
  }

  const decimals = decimalPlacesOf(answer.value);
  items.push({
    format: 'numerical',
    stem,
    solution: solution.replace(/\s+/g, ' ').trim(),
    numericAnswer: answer.value,
    answerFormat: 'decimal',
    decimalPlaces: decimals > 0 ? decimals : null,
    tolerance: defaultTolerance(answer.value),
    topicHint,
    difficultyPrior: 2, // source is unlabelled; band 2 until reviewers calibrate
    expectedTimeMs: 90_000,
    pool: 'practice', // diagnostic/reassessment pools require two approvals
    sourceName: 'DS-01 Aptitude-For-Placements',
    sourcePath: path,
    parserVersion: DS01_PARSER_VERSION,
  });
  return { items, rejected };
}
