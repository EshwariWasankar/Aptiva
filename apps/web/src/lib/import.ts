/** Typed helpers for the PH-3 import/company APIs (E-062/63/67/68/69 + extras). */
import { api } from './apiClient';

// ------------------------------------------------------------- E-062/63

export interface ImportRunResult {
  dryRun: boolean;
  source: string;
  sourceRef: string;
  filesSeen: number;
  parsed: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  unmappedTopics: { phrase: string; count: number }[];
  rejectedSample: { sourcePath: string; reason: string; excerpt?: string }[];
  duplicateSample: { sourcePath: string; stemHash: string; matchedExisting: boolean }[];
  batchId?: string;
}

export function runImport(body: {
  source: 'ds-01' | 'ds-03';
  ref?: string;
  dryRun: boolean;
}): Promise<ImportRunResult> {
  return api<ImportRunResult>('/admin/import', { method: 'POST', body });
}

export interface ImportBatch {
  id: string;
  sourceName: string;
  sourceRef: string;
  parserVersion: string;
  accepted: number;
  rejected: number;
  duplicates: number;
  createdBy: string | null;
  reversedAt: string | null;
  createdAt: string;
  questionCount: number;
}

export function listImportBatches(): Promise<ImportBatch[]> {
  return api<ImportBatch[]>('/admin/import-batches');
}

export function reverseImportBatch(id: string): Promise<void> {
  return api<void>(`/admin/import-batches/${id}`, { method: 'DELETE' });
}

// ------------------------------------------------------- E-067/68/69

export interface CompanyImportResult {
  dryRun: boolean;
  source: string;
  sourceRef: string;
  commit?: string;
  filesSeen: number;
  companies?: string[];
  recordsFound?: number;
  mapped?: number;
  unmappedPhrases?: { phrase: string; count: number }[];
  rejectedFiles?: { sourcePath: string; reason: string }[];
  note?: string;
  batchId?: string;
}

export function runCompanyImport(body: {
  source: 'ds-07' | 'ds-08';
  company?: string;
  ref?: string;
  dryRun: boolean;
}): Promise<CompanyImportResult> {
  return api<CompanyImportResult>('/admin/company-imports', { method: 'POST', body });
}

export interface PatternRecord {
  id: string;
  company: string;
  roundName: string | null;
  sectionName: string | null;
  topicText: string | null;
  topic: { id: string; slug: string; name: string } | null;
  questionCount: number | null;
  minutes: number | null;
  negativeMarking: string | null;
  difficultyNote: string | null;
  sourcePath: string;
  sourceCommit: string;
  status: string;
  importBatchId: string;
  sourceRef: string;
}

export interface PatternList {
  items: PatternRecord[];
  unmappedPhrases: { phrase: string; count: number }[];
}

export function listCompanyPatterns(params: {
  company?: string;
  status?: string;
  unmapped?: boolean;
}): Promise<PatternList> {
  const qs = new URLSearchParams();
  if (params.company) qs.set('company', params.company);
  if (params.status) qs.set('status', params.status);
  if (params.unmapped) qs.set('unmapped', 'true');
  const suffix = qs.size ? `?${qs.toString()}` : '';
  return api<PatternList>(`/admin/company-patterns${suffix}`);
}

export function mapPattern(
  id: string,
  body: { topicSlug?: string; reject?: boolean; addSynonym?: boolean },
): Promise<{ id: string; status: string; topicId?: string }> {
  return api(`/admin/company-patterns/${id}/map`, { method: 'POST', body });
}

export function draftBlueprintFromRecords(body: {
  company: string;
  importBatchId?: string;
}): Promise<unknown> {
  return api('/admin/blueprints/draft-from-records', { method: 'POST', body });
}

export function recomputeFitTags(assessmentId: string): Promise<{
  assessmentId: string;
  sections: number;
  tags: number;
}> {
  return api(`/admin/blueprints/${assessmentId}/fit-tags`, { method: 'POST' });
}

// ------------------------------------------------------------- coverage

export interface CoverageCell {
  topic: { slug: string; name: string; level: string };
  difficultyBand: number;
  pool: string;
  status: string;
  count: number;
  belowThreshold: boolean;
}

export interface CoverageReport {
  threshold: number;
  target: string;
  cells: CoverageCell[];
  belowThreshold: {
    topic: string;
    difficultyBand: number;
    pool: string;
    count: number;
    threshold: number;
  }[];
  totals: { reviewed: number; published: number };
}

export function getCoverage(): Promise<CoverageReport> {
  return api<CoverageReport>('/admin/coverage');
}
