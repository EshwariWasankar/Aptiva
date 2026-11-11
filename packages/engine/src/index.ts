export const ENGINE_VERSION = '0.2.0';

/** Smoke function: proves the package is importable and pure. */
export function engineVersion(): string {
  return ENGINE_VERSION;
}

export {
  EngineError,
  markAttempt,
  parseNumericInput,
  type EngineErrorCode,
  type MarkingContext,
  type MarkingInput,
  type MarkingQuestion,
  type MarkingResult,
} from './marking.js';

export {
  inferError,
  type ErrorTypeCode,
  type InferErrorInput,
  type InferErrorResult,
} from './infer-error.js';

export {
  analyzeDiagnostic,
  type DiagnosticAttemptInput,
  type DiagnosticSummary,
  type TopicAccuracy,
  type BandAccuracy,
} from './diagnostic-analysis.js';
