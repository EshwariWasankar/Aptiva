import type { ParsedItem, RejectedRow } from '../types.js';
import { decimalPlacesOf, defaultTolerance } from '../normalize.js';

export const DSM8K_PARSER_VERSION = 'dsm8k-v1';

/**
 * DS-03 parser — GSM8K (grade-school math word problems).
 * Input: JSONL rows {"question": "...", "answer": "reasoning... #### N"}.
 * Maps to format=numerical with the value after the `####` marker.
 * Grade-school level → difficultyPrior 1, practice pool only.
 */

export interface Gsm8kRow {
  question?: unknown;
  answer?: unknown;
}

export function parseGsm8k(
  content: string,
  sourcePath: string,
): {
  items: ParsedItem[];
  rejected: RejectedRow[];
} {
  const items: ParsedItem[] = [];
  const rejected: RejectedRow[] = [];
  const lines = content.split('\n').filter((l) => l.trim().length > 0);

  lines.forEach((line, idx) => {
    let row: Gsm8kRow;
    try {
      row = JSON.parse(line) as Gsm8kRow;
    } catch {
      rejected.push({ sourcePath: `${sourcePath}:${idx + 1}`, reason: 'invalid JSONL row' });
      return;
    }
    const question = typeof row.question === 'string' ? row.question.trim() : '';
    const answer = typeof row.answer === 'string' ? row.answer : '';
    if (!question) {
      rejected.push({ sourcePath: `${sourcePath}:${idx + 1}`, reason: 'empty question' });
      return;
    }
    const marker = answer.lastIndexOf('####');
    if (marker === -1) {
      rejected.push({
        sourcePath: `${sourcePath}:${idx + 1}`,
        reason: 'answer has no #### final-value marker',
      });
      return;
    }
    const literal = answer
      .slice(marker + 4)
      .trim()
      .replace(/[$,]/g, '');
    const value = Number(literal);
    if (!Number.isFinite(value)) {
      rejected.push({
        sourcePath: `${sourcePath}:${idx + 1}`,
        reason: `non-numeric final answer: ${literal.slice(0, 40)}`,
      });
      return;
    }
    const decimals = decimalPlacesOf(value);
    items.push({
      format: 'numerical',
      stem: question,
      solution: answer.slice(0, marker).trim() || null,
      numericAnswer: value,
      answerFormat: 'decimal',
      decimalPlaces: decimals > 0 ? decimals : null,
      tolerance: defaultTolerance(value),
      topicHint: 'arithmetic', // GSM8K is unlabelled grade-school arithmetic
      difficultyPrior: 1,
      expectedTimeMs: 120_000,
      pool: 'practice',
      sourceName: 'DS-03 GSM8K',
      sourcePath: `${sourcePath}:${idx + 1}`,
      parserVersion: DSM8K_PARSER_VERSION,
    });
  });

  return { items, rejected };
}
