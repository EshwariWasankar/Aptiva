/**
 * Typed helpers for the PH-2 content APIs (E-055/56 public, E-060/61/64/65
 * admin). All calls go through apiClient (envelope unwrap + refresh-on-401).
 */
import { api } from './apiClient';

// ------------------------------------------------------------- shared

export interface TopicRef {
  id: string;
  slug: string;
  name: string;
  level: string;
}

export interface TopicNode extends TopicRef {
  parent: { id: string; slug: string; name: string } | null;
}

export interface ProvenanceSource {
  id: string;
  sourceType: string;
  reference: string | null;
  confidence: string;
  lastVerifiedAt: string | null;
}

export interface BlueprintWeight {
  id: string;
  topic: TopicRef;
  share: number;
  difficultyBand: number | null;
  paceSeconds: number | null;
  source: ProvenanceSource | null;
}

export interface BlueprintSection {
  id: string;
  name: string;
  orderNo: number;
  durationMin: number | null;
  questionCountMin: number | null;
  questionCountMax: number | null;
  negativeMarking: string | null;
  formatMix: { mcq?: number; numerical?: number } | null;
  source: ProvenanceSource | null;
  weights: BlueprintWeight[];
}

export interface BlueprintVersion {
  id: string;
  version: number;
  isCurrent: boolean;
  validFrom: string;
  lastVerifiedAt: string | null;
  sources: ProvenanceSource[];
  sections: BlueprintSection[];
}

export interface PublicAssessment {
  id: string;
  slug: string;
  company: string;
  name: string;
  currentVersion: { version: number; validFrom: string; lastVerifiedAt: string | null } | null;
}

export interface PublicBlueprint {
  assessment: { id: string; slug: string; company: string; name: string };
  version: BlueprintVersion;
}

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean;
  trapTag: string | null;
  orderNo: number;
}

export interface QuestionReview {
  id: string;
  reviewer: { id: string; email: string; role: string };
  decision: string;
  notes: string | null;
  createdAt: string;
}

export interface Question {
  id: string;
  topic: TopicRef;
  format: 'mcq' | 'numerical';
  stem: string;
  solution: string | null;
  difficultyPrior: number;
  eloRating: number;
  expectedTimeMs: number;
  language: string;
  numericAnswer: string | null;
  answerFormat: string | null;
  decimalPlaces: number | null;
  tolerance: string | null;
  pool: string;
  status: string;
  sourceName: string | null;
  author: string | null;
  llmAssisted: boolean;
  stemHash: string;
  createdAt: string;
  updatedAt: string;
  options: QuestionOption[];
  reviews: QuestionReview[];
}

export interface QuestionListResult {
  items: Question[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BlueprintListItem {
  id: string;
  slug: string;
  company: string;
  name: string;
  versions: {
    id: string;
    version: number;
    isCurrent: boolean;
    validFrom: string;
    lastVerifiedAt: string | null;
    sectionCount: number;
  }[];
}

export interface BlueprintDetail {
  id: string;
  slug: string;
  company: string;
  name: string;
  versions: BlueprintVersion[];
}

// --------------------------------------------------------- payload types

export interface QuestionOptionInput {
  id?: string;
  text: string;
  isCorrect: boolean;
  trapTag?: string | null;
  orderNo?: number;
}

export interface QuestionUpsert {
  topicId: string;
  format: 'mcq' | 'numerical';
  stem: string;
  solution?: string | null;
  difficultyPrior: number;
  expectedTimeMs: number;
  language?: string;
  pool: 'diagnostic' | 'practice' | 'reassessment';
  status?: 'draft' | 'reviewed' | 'published' | 'retired';
  sourceName?: string | null;
  author?: string | null;
  numericAnswer?: number | string | null;
  answerFormat?: 'integer' | 'decimal' | null;
  decimalPlaces?: number | null;
  tolerance?: number | string | null;
  options?: QuestionOptionInput[];
}

export interface BlueprintSourceInput {
  sourceType: 'official' | 'public' | 'candidate_reported' | 'pattern_inferred' | 'assumption';
  reference?: string | null | undefined;
  confidence: 'low' | 'medium' | 'high';
  lastVerifiedAt?: string | null | undefined;
}

export interface BlueprintWeightInput {
  topicSlug: string;
  share: number;
  difficultyBand?: number | null | undefined;
  paceSeconds?: number | null | undefined;
  sourceIndex?: number | undefined;
}

export interface BlueprintSectionInput {
  name: string;
  orderNo: number;
  durationMin?: number | null | undefined;
  questionCountMin?: number | null | undefined;
  questionCountMax?: number | null | undefined;
  negativeMarking?: number | null | undefined;
  formatMix?: { mcq: number; numerical: number } | null | undefined;
  sourceIndex?: number | undefined;
  weights: BlueprintWeightInput[];
}

export interface BlueprintBody {
  validFrom?: string | undefined;
  lastVerifiedAt?: string | null | undefined;
  sources: BlueprintSourceInput[];
  sections: BlueprintSectionInput[];
}

// ------------------------------------------------------------- public

export function listAssessments(): Promise<PublicAssessment[]> {
  return api<PublicAssessment[]>('/assessments', { auth: false });
}

export function getPublicBlueprint(slug: string): Promise<PublicBlueprint> {
  return api<PublicBlueprint>(`/assessments/${encodeURIComponent(slug)}/blueprint`, {
    auth: false,
  });
}

// -------------------------------------------------------------- admin

export function adminListQuestions(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const suffix = qs.size ? `?${qs.toString()}` : '';
  return api<QuestionListResult>(`/admin/questions${suffix}`);
}

export function adminGetQuestion(id: string): Promise<Question> {
  return api<Question>(`/admin/questions/${id}`);
}

export function adminCreateQuestion(body: QuestionUpsert): Promise<Question> {
  return api<Question>('/admin/questions', { method: 'POST', body });
}

export function adminUpdateQuestion(id: string, body: QuestionUpsert): Promise<Question> {
  return api<Question>(`/admin/questions/${id}`, { method: 'PUT', body });
}

export function adminReviewQuestion(
  id: string,
  body: { decision: 'approve' | 'reject'; notes?: string | null },
): Promise<Question> {
  return api<Question>(`/admin/questions/${id}/review`, { method: 'POST', body });
}

export function adminListBlueprints(): Promise<BlueprintListItem[]> {
  return api<BlueprintListItem[]>('/admin/blueprints');
}

export function adminGetBlueprint(id: string): Promise<BlueprintDetail> {
  return api<BlueprintDetail>(`/admin/blueprints/${id}`);
}

export function adminCreateBlueprint(
  body: BlueprintBody & { slug: string; company: string; name: string },
): Promise<BlueprintDetail> {
  return api<BlueprintDetail>('/admin/blueprints', { method: 'POST', body });
}

export function adminAddBlueprintVersion(
  id: string,
  body: BlueprintBody,
): Promise<BlueprintDetail> {
  return api<BlueprintDetail>(`/admin/blueprints/${id}`, { method: 'PUT', body });
}

export function adminListTopics(): Promise<TopicNode[]> {
  return api<TopicNode[]>('/admin/taxonomy');
}
