import { api } from './apiClient';

// ------------------------------------------------------------- types

export interface DiagnosticActive {
  id: string;
  mode: 'standard' | 'express';
  status: 'active' | 'paused';
  questionCount: number;
  answeredCount: number;
  pauseCount: number;
}

export interface DiagnosticCreated {
  id: string;
  mode: string;
  questionCount: number;
  status: string;
}

export interface ServedQuestion {
  id: string;
  format: 'mcq' | 'numerical';
  stem: string;
  expectedTimeMs: number;
  difficultyPrior: number;
  answerFormat: string | null;
  decimalPlaces: number | null;
  shownAt: string;
  options: { id: string; text: string; orderNo: number }[];
}

export interface NextResponse {
  done: boolean;
  position?: number;
  total?: number;
  answeredCount?: number;
  totalCount?: number;
  question?: ServedQuestion;
}

export interface AttemptAck {
  attemptId: string;
  recorded: boolean;
  sequenceNo: number;
  position: number;
  total: number;
}

export interface ErrorType {
  id: number;
  code: string;
  label: string;
  category: string;
}

export interface TopicAccuracy {
  topicId: string;
  topicName: string | null;
  sectionName: string | null;
  attempts: number;
  answered: number;
  correct: number;
  accuracy: number | null;
  avgTimeRatio: number | null;
  thinEvidence: boolean;
}

export interface DiagnosticResult {
  mode: 'standard' | 'express';
  coarse: boolean;
  engineVersion: string;
  totals: {
    questions: number;
    attempts: number;
    answered: number;
    correct: number;
    skipped: number;
    accuracy: number | null;
  };
  byTopic: TopicAccuracy[];
  byDifficulty: {
    band: number;
    label: string;
    attempts: number;
    correct: number;
    accuracy: number | null;
  }[];
  timeVsExpected: {
    avgRatio: number | null;
    overExpectedShare: number | null;
    underExpectedShare: number | null;
  };
  skipPattern: { skippedCount: number; skippedShare: number | null; skippedPositions: number[] };
  consistency: {
    firstHalfAccuracy: number | null;
    secondHalfAccuracy: number | null;
    drift: number | null;
    unstable: boolean;
  };
  thinEvidence: string[];
}

export interface ResultResponse {
  diagnosticId: string;
  status: string;
  result: DiagnosticResult;
}

export interface ReviewItem {
  attemptId: string;
  sequenceNo: number;
  questionId: string;
  stem: string;
  solution: string | null;
  format: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  numericAnswer: string | null;
  answerFormat: string | null;
  decimalPlaces: number | null;
  tolerance: string | null;
  selectedOptionId: string | null;
  numericInput: string | null;
  isCorrect: boolean | null;
  skipped: boolean;
  timeMs: number | null;
  expectedTimeMs: number;
  topicName: string;
  feedback: { errorType: string; errorTypeLabel: string; freeText: string | null } | null;
  inference: {
    errorType: string | null;
    method: string;
    confidence: number;
    conflict: boolean;
  } | null;
}

export interface ReviewResponse {
  diagnosticId: string;
  mode: string;
  items: ReviewItem[];
}

export interface FeedbackResult {
  attemptId: string;
  errorType: string;
  errorTypeLabel: string;
  method: string;
  confidence: number;
  conflict: boolean;
}

// ------------------------------------------------------------- calls

export function getActiveDiagnostic() {
  return api<DiagnosticActive | null>('/diagnostics/active');
}

export function createDiagnostic(mode: 'standard' | 'express') {
  return api<DiagnosticCreated>('/diagnostics', { method: 'POST', body: { mode } });
}

export function getNextQuestion(id: string) {
  return api<NextResponse>(`/diagnostics/${id}/next`);
}

export function submitDiagnosticAnswer(
  id: string,
  questionId: string,
  body: {
    attemptId: string;
    selectedOptionId?: string | null;
    numericInput?: string | null;
    skipped?: boolean;
    revisitCount?: number;
    answerChanges?: number;
  },
) {
  return api<AttemptAck>(`/diagnostics/${id}/answers/${questionId}`, { method: 'PUT', body });
}

export function pauseDiagnostic(id: string) {
  return api<{ id: string; status: string; pauseCount: number }>(`/diagnostics/${id}/pause`, {
    method: 'POST',
  });
}

export function submitDiagnostic(id: string, attemptIds: string[]) {
  return api<{ diagnosticId: string; resultStatus: string }>(`/diagnostics/${id}/submit`, {
    method: 'POST',
    body: { attemptIds },
  });
}

export function getDiagnosticResult(id: string) {
  return api<ResultResponse>(`/diagnostics/${id}/result`);
}

export function getDiagnosticReview(id: string) {
  return api<ReviewResponse>(`/diagnostics/${id}/review`);
}

export function getErrorTypes() {
  return api<ErrorType[]>('/diagnostics/error-types');
}

export function submitErrorFeedback(attemptId: string, errorType: string, freeText?: string) {
  return api<FeedbackResult>(`/attempts/${attemptId}/error-feedback`, {
    method: 'PUT',
    body: { errorType, freeText: freeText ?? null },
  });
}
