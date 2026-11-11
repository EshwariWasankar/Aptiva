import type { PatternRecordDraft } from './types.js';

/**
 * Blueprint drafter (Section 14.1 step 3, PH3-T10).
 * Groups mapped pattern records into a draft blueprint payload that the
 * API can persist as a non-current assessment version for admin review.
 *
 * Rules implemented:
 * - share comes from stated question_count where present; missing counts
 *   produce an even split flagged as an assumption;
 * - pace_seconds = minutes*60 / count where both exist;
 * - numeric conflicts: median after outlier removal; unresolved spread
 *   becomes a range note and the cautious (larger) value is used;
 * - every field carries candidate_reported provenance via sourceIndex
 *   back-references into the emitted sources array.
 */

export interface MappedRecord extends PatternRecordDraft {
  topicId: string | null;
  topicSlug: string | null;
  /** Pinned commit this record was extracted at (may differ per record). */
  sourceCommit?: string;
}

export interface DraftSource {
  sourceType: 'candidate_reported';
  reference: string; // "repo-path @ commit"
  confidence: 'low' | 'medium';
  lastVerifiedAt: null;
}

export interface DraftWeight {
  topicSlug: string;
  share: number;
  difficultyBand: number | null;
  paceSeconds: number | null;
  sourceIndex: number;
  assumption?: boolean;
}

export interface DraftSection {
  name: string;
  orderNo: number;
  durationMin: number | null;
  questionCountMin: number | null;
  questionCountMax: number | null;
  negativeMarking: number | null;
  formatMix: null;
  sourceIndex: number;
  weights: DraftWeight[];
  assumptions: string[];
}

export interface BlueprintDraft {
  slug: string;
  company: string;
  name: string;
  validFrom: string;
  lastVerifiedAt: null;
  sources: DraftSource[];
  sections: DraftSection[];
  unmappedCount: number;
}

const STOP_WORDS = /\b(assessment|online|oa|test|exam|section|ability|aptitude)\b/gi;

export function slugifyCompany(company: string): string {
  return company
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Median after outlier removal (values beyond 1.5×IQR are dropped). */
export function medianWithoutOutliers(values: number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  if (xs.length <= 2) {
    return xs.length === 1 ? xs[0]! : (xs[0]! + xs[1]!) / 2;
  }
  const q1 = xs[Math.floor((xs.length - 1) / 4)]!;
  const q3 = xs[Math.floor((3 * (xs.length - 1)) / 4)]!;
  const iqr = q3 - q1;
  const lo = q1 - 1.5 * iqr;
  const hi = q3 + 1.5 * iqr;
  const kept = xs.filter((v) => v >= lo && v <= hi);
  const use = kept.length > 0 ? kept : xs;
  const mid = Math.floor(use.length / 2);
  return use.length % 2 === 1 ? use[mid]! : (use[mid - 1]! + use[mid]!) / 2;
}

/** Returns {min,max,conflict}: conflict=true when spread is material. */
export function numericRange(
  values: number[],
): { min: number; max: number; conflict: boolean } | null {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return null;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const med = medianWithoutOutliers(xs) ?? min;
  return { min, max, conflict: max - min > Math.max(1, med * 0.5) };
}

export function draftBlueprintFromRecords(
  company: string,
  records: readonly MappedRecord[],
  opts: { commit: string; today?: string } = { commit: '' },
): BlueprintDraft {
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  // sources: unique (path, commit) pairs, in first-seen order.
  const sourceIndex = new Map<string, number>();
  const sources: DraftSource[] = [];
  const srcIdx = (path: string, commit?: string): number => {
    const c = commit ?? opts.commit;
    const key = `${path}@${c}`;
    let i = sourceIndex.get(key);
    if (i === undefined) {
      i = sources.length;
      sourceIndex.set(key, i);
      sources.push({
        sourceType: 'candidate_reported',
        reference: `${path} @ ${c || 'unpinned'}`,
        confidence: 'low',
        lastVerifiedAt: null,
      });
    }
    return i;
  };

  // Group records by roundName → sectionName.
  const rounds = new Map<string, Map<string, MappedRecord[]>>();
  for (const r of records) {
    const round = r.roundName ?? 'Assessment';
    const section = r.sectionName ?? 'General';
    if (!rounds.has(round)) rounds.set(round, new Map());
    const secs = rounds.get(round)!;
    if (!secs.has(section)) secs.set(section, []);
    secs.get(section)!.push(r);
  }

  const roundName = [...rounds.keys()][0] ?? 'Assessment';
  const sectionsMap = rounds.get(roundName) ?? new Map<string, MappedRecord[]>();
  const sectionNames = [...sectionsMap.keys()];

  // Section order: keep source order of first appearance.
  const sections: DraftSection[] = [];
  let orderNo = 1;
  for (const secName of sectionNames) {
    const recs = sectionsMap.get(secName)!;
    const assumptions: string[] = [];

    // Topic weights: distinct mapped topics in this section.
    const byTopic = new Map<string, { count: number; minutes: number[]; recs: MappedRecord[] }>();
    for (const r of recs) {
      if (!r.topicId || !r.topicSlug) continue;
      const cur = byTopic.get(r.topicSlug) ?? { count: 0, minutes: [], recs: [] };
      cur.count += r.questionCount ?? 0;
      if (r.minutes != null) cur.minutes.push(r.minutes);
      cur.recs.push(r);
      byTopic.set(r.topicSlug, cur);
    }

    const topics = [...byTopic.entries()];
    const totalCount = topics.reduce((a, [, t]) => a + t.count, 0);
    const allCounted = topics.length > 0 && topics.every(([, t]) => t.count > 0);
    const weights: DraftWeight[] = [];

    if (topics.length > 0) {
      const evenSplit = !(allCounted && totalCount > 0);
      if (evenSplit) assumptions.push(`even share split for '${secName}' (counts not stated)`);
      for (const [slug, t] of topics) {
        const share = allCounted && totalCount > 0 ? t.count / totalCount : 1 / topics.length;
        const medMinutes = medianWithoutOutliers(t.minutes);
        const paceSeconds =
          medMinutes != null && t.count > 0 ? Math.round((medMinutes * 60) / t.count) : null;
        weights.push({
          topicSlug: slug,
          share: Number(share.toFixed(4)),
          difficultyBand: null,
          paceSeconds,
          sourceIndex: srcIdx(t.recs[0]!.sourcePath, t.recs[0]!.sourceCommit),
          ...(evenSplit ? { assumption: true } : {}),
        });
      }
      // Normalise shares to sum to 1 after rounding.
      const sum = weights.reduce((a, w) => a + w.share, 0);
      if (sum > 0 && Math.abs(sum - 1) > 0.001 && weights.length > 0) {
        weights[weights.length - 1]!.share = Number(
          (weights[weights.length - 1]!.share + (1 - sum)).toFixed(4),
        );
      }
    } else {
      assumptions.push(`no mapped topics for '${secName}'`);
    }

    // Section-level numerics come from section statements (topicText null);
    // topic records carry per-topic pace/count for weights instead.
    const secRecs = recs.filter((r) => !r.topicText);
    const numericSource = secRecs.length > 0 ? secRecs : recs;
    const counts = numericSource.map((r) => r.questionCount).filter((v): v is number => v != null);
    const minutesAll = numericSource.map((r) => r.minutes).filter((v): v is number => v != null);
    const countRange = numericRange(counts);
    const minRange = numericRange(minutesAll);

    let durationMin: number | null = null;
    if (minRange) {
      durationMin = Math.round(
        minRange.conflict ? minRange.max : (medianWithoutOutliers(minutesAll) ?? minRange.min),
      );
      if (minRange.conflict)
        assumptions.push(`conflicting minutes for '${secName}' — used cautious max`);
    }

    const negTexts = numericSource.map((r) => r.negativeMarking).filter((v): v is string => !!v);
    const negParsed = negTexts
      .map((t) => {
        const m = t.match(/-?\d+(?:\.\d+)?/);
        return m ? Number(m[0]) : null;
      })
      .filter((v): v is number => v != null);
    const negRange = numericRange(negParsed);
    const negativeMarking = negRange
      ? negRange.conflict
        ? negRange.max
        : (medianWithoutOutliers(negParsed) ?? negRange.min)
      : null;

    const firstRec = recs[0]!;
    sections.push({
      name: secName.replace(STOP_WORDS, '').trim() || secName,
      orderNo: orderNo++,
      durationMin,
      questionCountMin: countRange ? countRange.min : null,
      questionCountMax: countRange ? countRange.max : null,
      negativeMarking,
      formatMix: null,
      sourceIndex: srcIdx(firstRec.sourcePath, firstRec.sourceCommit),
      weights,
      assumptions,
    });
  }

  const companySlug = slugifyCompany(company);
  const roundSlug = roundName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return {
    slug: `${companySlug}-${roundSlug || 'assessment'}`,
    company,
    name: `${company} ${roundName}`.replace(/\s+/g, ' ').trim(),
    validFrom: today,
    lastVerifiedAt: null,
    sources,
    sections,
    unmappedCount: records.filter((r) => !r.topicId).length,
  };
}
