import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as tar from 'tar';
import { fetchGitHubRepo, type FetchImpl } from '../src/github.js';
import {
  draftBlueprintFromRecords,
  medianWithoutOutliers,
  numericRange,
  slugifyCompany,
  type MappedRecord,
} from '../src/drafter.js';
import { computeFit, difficultyProximity, formatShare } from '../src/fit.js';
import { mapDs01Folder, mapTopicText, type MapperInput } from '../src/mapper.js';
import { runQuestionPipeline } from '../src/pipeline.js';
import { stemHash } from '../src/normalize.js';
import type { ParsedItem } from '../src/types.js';

const TOPICS = [
  { id: 't1', slug: 'percentages', name: 'Percentages' },
  { id: 't2', slug: 'time-work', name: 'Time and Work' },
  { id: 't3', slug: 'averages', name: 'Averages' },
];
const MAPPER: MapperInput = {
  synonyms: new Map([['simple interest', 't1']]),
  topics: TOPICS,
};

function rec(over: Partial<MappedRecord>): MappedRecord {
  return {
    company: 'TCS',
    roundName: 'Online Assessment',
    sectionName: 'Numerical Ability',
    topicText: 'Percentages',
    topicId: 't1',
    topicSlug: 'percentages',
    questionCount: null,
    minutes: null,
    negativeMarking: null,
    difficultyNote: null,
    sourcePath: 'Companies/01-TCS/01-OA.md',
    ...over,
  };
}

describe('mapper', () => {
  it('maps via synonyms, slugs and names; misses go to null', () => {
    expect(mapTopicText('Simple Interest', MAPPER)).toBe('t1');
    expect(mapTopicText('  PERCENTAGES ', MAPPER)).toBe('t1');
    expect(mapTopicText('Time and Work', MAPPER)).toBe('t2');
    expect(mapTopicText('quantum chromodynamics', MAPPER)).toBeNull();
    expect(mapTopicText(null, MAPPER)).toBeNull();
  });

  it('maps DS-01 folder names to taxonomy slugs', () => {
    expect(mapDs01Folder('Percentage', MAPPER)).toBe('percentages');
    expect(mapDs01Folder('Time and Work', MAPPER)).toBe('time-work');
    expect(mapDs01Folder('Problems on Train', MAPPER)).toBe('time-speed-distance');
    expect(mapDs01Folder('Averages', MAPPER)).toBe('averages');
  });
});

describe('drafter math', () => {
  it('medianWithoutOutliers drops IQR outliers', () => {
    expect(medianWithoutOutliers([30, 30, 30, 30, 200])).toBe(30);
    expect(medianWithoutOutliers([10])).toBe(10);
    expect(medianWithoutOutliers([])).toBeNull();
  });

  it('numericRange flags material spread as conflict', () => {
    expect(numericRange([30, 30, 30])?.conflict).toBe(false);
    const r = numericRange([10, 10, 90]);
    expect(r?.conflict).toBe(true);
    expect(numericRange([])).toBeNull();
  });
});

describe('draftBlueprintFromRecords', () => {
  it('even-splits shares and flags the assumption when counts are missing', () => {
    const draft = draftBlueprintFromRecords(
      'TCS',
      [
        rec({ topicSlug: 'percentages', topicId: 't1' }),
        rec({ topicSlug: 'time-work', topicId: 't2', topicText: 'Time and Work' }),
      ],
      { commit: 'abc123' },
    );
    expect(draft.slug).toBe('tcs-online-assessment');
    const sec = draft.sections[0]!;
    expect(sec.weights).toHaveLength(2);
    expect(sec.weights[0]!.share).toBeCloseTo(0.5, 3);
    expect(sec.weights[0]!.assumption).toBe(true);
    expect(sec.assumptions.join(' ')).toMatch(/even share split/);
    expect(draft.sources[0]!.sourceType).toBe('candidate_reported');
    expect(draft.sources[0]!.reference).toContain('abc123');
    expect(draft.unmappedCount).toBe(0);
  });

  it('uses stated counts for shares and minutes/count for pace', () => {
    const draft = draftBlueprintFromRecords(
      'TCS',
      [
        rec({ topicText: null, topicSlug: null, topicId: null, questionCount: 40, minutes: 40 }),
        rec({ topicSlug: 'percentages', topicId: 't1', questionCount: 30, minutes: 30 }),
        rec({
          topicSlug: 'time-work',
          topicId: 't2',
          topicText: 'Time and Work',
          questionCount: 10,
          minutes: 10,
        }),
      ],
      { commit: 'c1' },
    );
    const w = draft.sections[0]!.weights;
    expect(w.find((x) => x.topicSlug === 'percentages')!.share).toBeCloseTo(0.75, 3);
    expect(w.find((x) => x.topicSlug === 'percentages')!.paceSeconds).toBe(60);
    expect(draft.sections[0]!.assumptions).toHaveLength(0);
  });

  it('slugifyCompany normalises names', () => {
    expect(slugifyCompany('LTIMindtree')).toBe('ltimindtree');
    expect(slugifyCompany('Hexaware & Co')).toBe('hexaware-and-co');
  });
});

describe('fit math (DATA-007)', () => {
  it('computeFit stays within [0,1] and is deterministic', () => {
    const cases = [
      { topicShare: 0.5, formatShare: 0.8, difficultyProximity: 1 },
      { topicShare: 2, formatShare: -1, difficultyProximity: 0.5 },
      { topicShare: 0, formatShare: 1, difficultyProximity: 1 },
      { topicShare: Number.NaN, formatShare: 1, difficultyProximity: 1 },
    ];
    for (const c of cases) {
      const a = computeFit(c);
      const b = computeFit(c);
      expect(a).toBe(b);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
    expect(computeFit(cases[0]!)).toBeCloseTo(0.4, 5);
  });

  it('formatShare and difficultyProximity behave per spec', () => {
    expect(formatShare(null, 'mcq')).toBe(0.5);
    expect(formatShare({ mcq: 0.7, numerical: 0.3 }, 'numerical')).toBeCloseTo(0.3, 5);
    expect(formatShare({ mcq: 0.7 }, 'numerical')).toBe(0);
    expect(difficultyProximity(2, 2)).toBe(1);
    expect(difficultyProximity(1, 3)).toBe(0);
    expect(difficultyProximity(2, null)).toBe(0.75);
  });
});

function item(over: Partial<ParsedItem>): ParsedItem {
  return {
    format: 'numerical',
    stem: 'A valid stem with enough characters to pass.',
    solution: null,
    numericAnswer: 42,
    topicHint: 'percentages',
    difficultyPrior: 2,
    expectedTimeMs: 60_000,
    pool: 'practice',
    sourceName: 'test',
    sourcePath: 'x.md',
    parserVersion: 't1',
    ...over,
  };
}

describe('runQuestionPipeline', () => {
  const ctx = {
    sourceName: 'test',
    sourceRef: 'ref',
    parserVersion: 't1',
    filesSeen: 1,
    existingHashes: new Set<string>(),
    mapper: MAPPER,
  };

  it('accepts mapped items and dedupes within batch and against bank', () => {
    const stem = 'Unique stem number one for dedupe testing purposes.';
    const report = runQuestionPipeline(
      [
        { item: item({ stem, topicHint: 'percentages' }), sourcePath: 'a.md' },
        { item: item({ stem: stem.toUpperCase(), topicHint: 'percentages' }), sourcePath: 'b.md' }, // batch dup (hash normalises case)
        {
          item: item({ stem: 'Second unique stem entirely different words here.' }),
          sourcePath: 'c.md',
        },
      ],
      ctx,
    );
    expect(report.accepted).toHaveLength(2);
    expect(report.duplicates).toHaveLength(1);
    expect(report.duplicates[0]!.matchedExisting).toBe(false);
    expect(report.accepted[0]!.item.topicId).toBe('t1');
  });

  it('flags bank duplicates via existingHashes', () => {
    const stem = 'Stem that already exists in the question bank today.';
    const report = runQuestionPipeline([{ item: item({ stem }), sourcePath: 'a.md' }], {
      ...ctx,
      existingHashes: new Set([stemHash(stem)]),
    });
    expect(report.accepted).toHaveLength(0);
    expect(report.duplicates[0]!.matchedExisting).toBe(true);
  });

  it('rejects unmapped topics and MCQ validation failures', () => {
    const report = runQuestionPipeline(
      [
        { item: item({ topicHint: 'unobtanium theory' }), sourcePath: 'a.md' },
        {
          item: item({
            format: 'mcq',
            numericAnswer: null,
            options: [
              { text: 'a', isCorrect: true },
              { text: 'b', isCorrect: true },
            ],
          }),
          sourcePath: 'b.md',
        },
        { item: item({ format: 'numerical', numericAnswer: null }), sourcePath: 'c.md' },
      ],
      ctx,
    );
    expect(report.accepted).toHaveLength(0);
    expect(report.rejected.map((r) => r.reason).join(' | ')).toMatch(/unmapped topic/);
    expect(report.rejected.map((r) => r.reason).join(' | ')).toMatch(/2 correct options/);
    expect(report.rejected.map((r) => r.reason).join(' | ')).toMatch(/missing numeric_answer/);
    expect(report.unmappedTopics[0]!.phrase).toBe('unobtanium theory');
  });
});

/**
 * Fetch-and-pin test (Section 15.3): a fake fetchImpl serves repo meta,
 * the commit lookup, and a real tar.gz built in-memory — proving the
 * pinned-commit tarball path works end to end without network.
 */
describe('fetchGitHubRepo (fetch-and-pin)', () => {
  it('downloads the tarball at the resolved commit and checksums files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ingest-'));
    const root = join(dir, 'repo-owner-repo-abc123');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'q.md'), '# Q\nProblem: test\n');
    writeFileSync(join(root, 'README.md'), 'root file\n');

    const tgz = join(dir, 'repo.tgz');
    await tar.c({ gzip: true, file: tgz, cwd: dir }, ['repo-owner-repo-abc123']);
    const { readFileSync } = await import('node:fs');
    const bytes = readFileSync(tgz);

    const fetchImpl: FetchImpl = async (url) => {
      if (url.includes('/repos/')) {
        if (url.endsWith('/commits/main')) {
          return new Response(JSON.stringify({ sha: 'abc123' }), { status: 200 });
        }
        return new Response(JSON.stringify({ default_branch: 'main' }), { status: 200 });
      }
      if (url.includes('codeload')) {
        return new Response(new Uint8Array(bytes), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    };

    const snap = await fetchGitHubRepo('repo-owner/repo', 'main', { fetchImpl });
    expect(snap.commit).toBe('abc123');
    expect(snap.files.map((f) => f.path).sort()).toEqual(['README.md', 'src/q.md']);
    expect(snap.files.find((f) => f.path === 'src/q.md')!.content).toContain('Problem: test');
    expect(snap.files[0]!.sha256).toMatch(/^[0-9a-f]{64}$/);
  });
});
