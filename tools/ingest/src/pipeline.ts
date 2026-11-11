import type {
  AcceptedRow,
  DuplicateRow,
  ParsedItem,
  PipelineReport,
  RejectedRow,
} from './types.js';
import { stemHash } from './normalize.js';
import { mapTopicText, type MapperInput } from './mapper.js';

export const PIPELINE_VERSION = 'pipeline-v1';

const MAX_STEM = 20_000;
const MIN_STEM = 10;

export interface PipelineContext {
  sourceName: string;
  sourceRef: string;
  parserVersion: string;
  filesSeen: number;
  /** stemHash values already present in the bank (non-retired). */
  existingHashes: ReadonlySet<string>;
  mapper: MapperInput;
}

/**
 * Common pipeline stages 3–5 (Classify → Validate → Deduplicate).
 * "Verify" for numerical items is intentionally a no-op: unverified
 * items stay `draft` until human review (Section 15.1 note).
 */
export function runQuestionPipeline(
  items: readonly { item: ParsedItem; sourcePath: string }[],
  ctx: PipelineContext,
): PipelineReport {
  const accepted: AcceptedRow[] = [];
  const rejected: RejectedRow[] = [];
  const duplicates: DuplicateRow[] = [];
  const unmapped = new Map<string, number>();
  const batchHashes = new Set<string>();

  for (const { item, sourcePath } of items) {
    // ---- Validate -----------------------------------------------------
    const stem = item.stem.trim();
    if (stem.length < MIN_STEM) {
      rejected.push({ sourcePath, reason: 'stem too short', excerpt: stem.slice(0, 80) });
      continue;
    }
    if (stem.length > MAX_STEM) {
      rejected.push({
        sourcePath,
        reason: 'stem exceeds length limit',
        excerpt: `${stem.length} chars`,
      });
      continue;
    }
    if (item.format === 'numerical' && item.numericAnswer == null) {
      rejected.push({ sourcePath, reason: 'numerical item missing numeric_answer' });
      continue;
    }
    if (item.format === 'mcq') {
      const opts = item.options ?? [];
      const correct = opts.filter((o) => o.isCorrect).length;
      if (opts.length < 2) {
        rejected.push({ sourcePath, reason: 'MCQ has fewer than 2 options' });
        continue;
      }
      if (correct !== 1) {
        rejected.push({
          sourcePath,
          reason: `MCQ has ${correct} correct options (need exactly 1)`,
        });
        continue;
      }
    }
    if (!(item.expectedTimeMs > 0)) {
      rejected.push({ sourcePath, reason: 'expected_time_ms must be positive' });
      continue;
    }

    // ---- Classify -----------------------------------------------------
    const topicId = mapTopicText(item.topicHint, ctx.mapper);
    if (!topicId) {
      const phrase = item.topicHint ?? '(none)';
      unmapped.set(phrase, (unmapped.get(phrase) ?? 0) + 1);
      rejected.push({ sourcePath, reason: `unmapped topic: ${phrase}` });
      continue;
    }

    // ---- Deduplicate ---------------------------------------------------
    const hash = stemHash(stem);
    if (batchHashes.has(hash)) {
      duplicates.push({ sourcePath, stemHash: hash, matchedExisting: false });
      continue;
    }
    if (ctx.existingHashes.has(hash)) {
      duplicates.push({ sourcePath, stemHash: hash, matchedExisting: true });
      continue;
    }
    batchHashes.add(hash);

    accepted.push({ item: { ...item, topicId }, stemHash: hash });
  }

  return {
    sourceName: ctx.sourceName,
    sourceRef: ctx.sourceRef,
    parserVersion: ctx.parserVersion,
    filesSeen: ctx.filesSeen,
    parsed: items.length,
    accepted,
    rejected,
    duplicates,
    unmappedTopics: [...unmapped.entries()].map(([phrase, count]) => ({ phrase, count })),
  };
}
