/** Shared ingest types (playbook Section 15.1 pipeline stages). */

export type QuestionFormat = 'mcq' | 'numerical';
export type QuestionPool = 'diagnostic' | 'practice' | 'reassessment';

/** One normalised candidate produced by a parser, pre-validation. */
export interface ParsedItem {
  format: QuestionFormat;
  stem: string;
  solution: string | null;
  /** MCQ options; numerical items leave this empty. */
  options?: { text: string; isCorrect: boolean; trapTag?: string | null }[];
  numericAnswer?: number | null;
  answerFormat?: 'integer' | 'decimal' | null;
  decimalPlaces?: number | null;
  /** Absolute tolerance for marking; null = exact. */
  tolerance?: number | null;
  /** Raw topic phrase as written in the source (mapped later). */
  topicHint: string | null;
  /** Filled by the classify stage; null until mapped. */
  topicId?: string | null;
  difficultyPrior: 1 | 2 | 3;
  expectedTimeMs: number;
  pool: QuestionPool;
  sourceName: string;
  sourcePath: string;
  /** Parser version that produced this item. */
  parserVersion: string;
}

export interface RejectedRow {
  sourcePath: string;
  reason: string;
  excerpt?: string;
}

export interface DuplicateRow {
  sourcePath: string;
  stemHash: string;
  matchedExisting: boolean;
}

export interface AcceptedRow {
  item: ParsedItem;
  stemHash: string;
}

export interface PipelineReport {
  sourceName: string;
  sourceRef: string;
  parserVersion: string;
  filesSeen: number;
  parsed: number;
  accepted: AcceptedRow[];
  rejected: RejectedRow[];
  duplicates: DuplicateRow[];
  unmappedTopics: { phrase: string; count: number }[];
}

/** Raw pattern record extracted from a company repository (DS-07/DS-08). */
export interface PatternRecordDraft {
  company: string;
  roundName: string | null;
  sectionName: string | null;
  topicText: string | null;
  questionCount: number | null;
  minutes: number | null;
  negativeMarking: string | null;
  difficultyNote: string | null;
  sourcePath: string;
}

export interface CompanyImportReport {
  sourceName: string;
  sourceRef: string;
  parserVersion: string;
  filesSeen: number;
  recordsFound: number;
  recordsRejected: RejectedRow[];
  unmappedPhrases: { phrase: string; count: number }[];
  companies: string[];
}
