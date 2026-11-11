/**
 * Database seed (playbook Section 13, PH2-T02 and PH2-T07).
 *
 * Seeds, idempotently:
 *  - taxonomy: four sections (Quant, Logical Reasoning, DI, Verbal),
 *    12 topics and sub-topics (PH2-T02; proposed taxonomy — team confirms)
 *  - error_types: the 11 seeded error types (Section 12.2)
 *  - assessments/blueprints: the generic fallback blueprint and one
 *    sample company blueprint, both with per-field provenance
 *    (PH2-T07)
 *
 * Requires DATABASE_URL. Run: `pnpm db:seed` (loads apps/api/.env).
 */
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

loadEnv({ path: resolve(__dirname, '../apps/api/.env') });
loadEnv();

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../apps/api/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? '' }),
});

// ------------------------------------------------------------ taxonomy

const SECTIONS = [
  { slug: 'quant', name: 'Quantitative Aptitude' },
  { slug: 'reasoning', name: 'Logical Reasoning' },
  { slug: 'di', name: 'Data Interpretation' },
  { slug: 'verbal', name: 'Verbal Ability' },
] as const;

const TOPICS: ReadonlyArray<{
  section: string;
  slug: string;
  name: string;
  subtopics: ReadonlyArray<{ slug: string; name: string }>;
}> = [
  {
    section: 'quant',
    slug: 'percentages',
    name: 'Percentages',
    subtopics: [
      { slug: 'percentage-change', name: 'Percentage change' },
      { slug: 'profit-and-loss', name: 'Profit and loss' },
    ],
  },
  {
    section: 'quant',
    slug: 'ratio-proportion',
    name: 'Ratio and Proportion',
    subtopics: [
      { slug: 'ratio', name: 'Ratio' },
      { slug: 'proportion', name: 'Proportion' },
    ],
  },
  {
    section: 'quant',
    slug: 'time-speed-distance',
    name: 'Time, Speed and Distance',
    subtopics: [
      { slug: 'speed-distance', name: 'Speed and distance' },
      { slug: 'trains-boats', name: 'Trains and boats' },
    ],
  },
  {
    section: 'quant',
    slug: 'time-work',
    name: 'Time and Work',
    subtopics: [
      { slug: 'work-time', name: 'Work and time' },
      { slug: 'pipes-cisterns', name: 'Pipes and cisterns' },
    ],
  },
  {
    section: 'quant',
    slug: 'permutations-combinations',
    name: 'Permutations and Combinations',
    subtopics: [
      { slug: 'permutations', name: 'Permutations' },
      { slug: 'combinations', name: 'Combinations' },
    ],
  },
  {
    section: 'quant',
    slug: 'probability',
    name: 'Probability',
    subtopics: [
      { slug: 'basic-probability', name: 'Basic probability' },
      { slug: 'conditional-probability', name: 'Conditional probability' },
    ],
  },
  {
    section: 'quant',
    slug: 'number-series',
    name: 'Number Series',
    subtopics: [
      { slug: 'arithmetic-series', name: 'Arithmetic series' },
      { slug: 'geometric-series', name: 'Geometric series' },
    ],
  },
  // PH-3 additions: DS-01 folders require these topics (D-04 allows seed
  // taxonomy migration as sources demand it).
  {
    section: 'quant',
    slug: 'averages',
    name: 'Averages',
    subtopics: [
      { slug: 'mean-median-mode', name: 'Mean, median and mode' },
      { slug: 'weighted-average', name: 'Weighted average' },
    ],
  },
  {
    section: 'quant',
    slug: 'ages',
    name: 'Problem on Ages',
    subtopics: [{ slug: 'age-relations', name: 'Age relations' }],
  },
  {
    section: 'quant',
    slug: 'partnership',
    name: 'Partnership',
    subtopics: [{ slug: 'profit-sharing', name: 'Profit sharing' }],
  },
  {
    section: 'quant',
    slug: 'profit-loss',
    name: 'Profit and Loss',
    subtopics: [
      { slug: 'discount', name: 'Discount' },
      { slug: 'marked-price', name: 'Marked price' },
    ],
  },
  {
    section: 'quant',
    slug: 'number-system',
    name: 'Number System',
    subtopics: [
      { slug: 'hcf-lcm', name: 'HCF and LCM' },
      { slug: 'remainders', name: 'Remainders' },
    ],
  },
  {
    section: 'reasoning',
    slug: 'logical-reasoning',
    name: 'Logical Reasoning (Puzzles)',
    subtopics: [
      { slug: 'puzzles', name: 'Puzzles' },
      { slug: 'syllogisms', name: 'Syllogisms' },
    ],
  },
  {
    section: 'reasoning',
    slug: 'arrangements',
    name: 'Arrangements',
    subtopics: [
      { slug: 'seating-arrangements', name: 'Seating arrangements' },
      { slug: 'ordering', name: 'Ordering and ranking' },
    ],
  },
  {
    section: 'di',
    slug: 'data-interpretation',
    name: 'Data Interpretation',
    subtopics: [
      { slug: 'tables-charts', name: 'Tables and charts' },
      { slug: 'caselets', name: 'Caselets' },
    ],
  },
  {
    section: 'verbal',
    slug: 'reading-comprehension',
    name: 'Reading Comprehension',
    subtopics: [
      { slug: 'rc-passage', name: 'RC passages' },
      { slug: 'inference', name: 'Inference questions' },
    ],
  },
  {
    section: 'verbal',
    slug: 'grammar-vocabulary',
    name: 'Grammar and Vocabulary',
    subtopics: [
      { slug: 'grammar', name: 'Grammar' },
      { slug: 'vocabulary', name: 'Vocabulary' },
    ],
  },
];

// Section 12.2: "Seeded error_types: concept (conceptual gap), formula
// (formula or recall), calculation, misread, time (time management),
// careless, underprepared, application (knew concept, could not apply),
// guess, units_rounding, other."
const ERROR_TYPES: ReadonlyArray<{ id: number; code: string; label: string; category: string }> = [
  { id: 1, code: 'concept', label: 'Conceptual gap', category: 'knowledge' },
  { id: 2, code: 'formula', label: 'Formula or recall', category: 'knowledge' },
  { id: 3, code: 'calculation', label: 'Calculation error', category: 'skill' },
  { id: 4, code: 'misread', label: 'Misread question', category: 'careless' },
  { id: 5, code: 'time', label: 'Time management', category: 'pace' },
  { id: 6, code: 'careless', label: 'Careless mistake', category: 'careless' },
  { id: 7, code: 'underprepared', label: 'Underprepared topic', category: 'knowledge' },
  { id: 8, code: 'application', label: 'Knew concept, could not apply', category: 'skill' },
  { id: 9, code: 'guess', label: 'Guessed', category: 'strategy' },
  { id: 10, code: 'units_rounding', label: 'Rounding or units', category: 'skill' },
  { id: 11, code: 'other', label: 'Other', category: 'other' },
];

// ------------------------------------------------------------ blueprints

interface SeedWeight {
  topic: string;
  share: number;
  difficultyBand?: number;
  paceSeconds?: number;
  source: 'primary' | 'secondary';
}

interface SeedSection {
  name: string;
  orderNo: number;
  durationMin: number;
  questionCountMin: number;
  questionCountMax: number;
  negativeMarking: number | null;
  formatMix: { mcq: number; numerical: number };
  source: 'primary' | 'secondary';
  weights: SeedWeight[];
}

async function seedBlueprint(opts: {
  slug: string;
  company: string;
  name: string;
  sources: Array<{
    key: 'primary' | 'secondary';
    sourceType: 'official' | 'public' | 'candidate_reported' | 'pattern_inferred' | 'assumption';
    reference: string;
    confidence: 'low' | 'medium' | 'high';
    lastVerifiedAt?: Date;
  }>;
  sections: SeedSection[];
}): Promise<void> {
  const topicIds = new Map<string, string>();
  for (const t of await prisma.topic.findMany({ where: { level: 'topic' } })) {
    topicIds.set(t.slug, t.id);
  }

  const assessment = await prisma.assessment.upsert({
    where: { slug: opts.slug },
    update: { company: opts.company, name: opts.name },
    create: { slug: opts.slug, company: opts.company, name: opts.name },
  });

  // Version 1 is seeded once; later versions are created via E-064.
  const existing = await prisma.assessmentVersion.findFirst({
    where: { assessmentId: assessment.id, version: 1 },
  });
  if (existing) return;

  const version = await prisma.assessmentVersion.create({
    data: {
      assessmentId: assessment.id,
      version: 1,
      isCurrent: true,
      validFrom: new Date(),
    },
  });

  const sourceIds = new Map<string, string>();
  for (const s of opts.sources) {
    const row = await prisma.assessmentSource.create({
      data: {
        versionId: version.id,
        sourceType: s.sourceType,
        reference: s.reference,
        confidence: s.confidence,
        lastVerifiedAt: s.lastVerifiedAt ?? null,
      },
    });
    sourceIds.set(s.key, row.id);
  }

  for (const s of opts.sections) {
    const section = await prisma.blueprintSection.create({
      data: {
        versionId: version.id,
        name: s.name,
        orderNo: s.orderNo,
        durationMin: s.durationMin,
        questionCountMin: s.questionCountMin,
        questionCountMax: s.questionCountMax,
        negativeMarking: s.negativeMarking,
        formatMix: s.formatMix,
        sourceId: sourceIds.get(s.source) ?? null,
      },
    });
    for (const w of s.weights) {
      const topicId = topicIds.get(w.topic);
      if (!topicId) throw new Error(`seed: unknown topic slug '${w.topic}'`);
      await prisma.blueprintTopicWeight.create({
        data: {
          sectionId: section.id,
          topicId,
          share: w.share,
          difficultyBand: w.difficultyBand ?? null,
          paceSeconds: w.paceSeconds ?? null,
          sourceId: sourceIds.get(w.source) ?? null,
        },
      });
    }
  }
  console.log(`seed: blueprint '${opts.slug}' v1 created`);
}

// ------------------------------------------------------------ main

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set (expected in apps/api/.env)');
  }

  // Taxonomy: sections first, then topics, then sub-topics.
  const sectionIds = new Map<string, string>();
  for (const s of SECTIONS) {
    const row = await prisma.topic.upsert({
      where: { slug: s.slug },
      update: { name: s.name, level: 'section' },
      create: { slug: s.slug, name: s.name, level: 'section' },
    });
    sectionIds.set(s.slug, row.id);
  }
  for (const t of TOPICS) {
    const parentId = sectionIds.get(t.section);
    if (!parentId) throw new Error(`seed: unknown section '${t.section}'`);
    const topic = await prisma.topic.upsert({
      where: { slug: t.slug },
      update: { name: t.name, level: 'topic', parentId },
      create: { slug: t.slug, name: t.name, level: 'topic', parentId },
    });
    for (const sub of t.subtopics) {
      await prisma.topic.upsert({
        where: { slug: sub.slug },
        update: { name: sub.name, level: 'subtopic', parentId: topic.id },
        create: { slug: sub.slug, name: sub.name, level: 'subtopic', parentId: topic.id },
      });
    }
  }
  console.log(`seed: taxonomy — ${SECTIONS.length} sections, ${TOPICS.length} topics`);

  // PH-3: topic_synonyms for source phrases (DS-01 folder names and common
  // DS-07 topic statements) so the ingest mapper resolves them without
  // manual queue work. Idempotent upsert by phrase.
  const topicIdBySlug = new Map(
    (await prisma.topic.findMany({ select: { id: true, slug: true } })).map((t) => [t.slug, t.id]),
  );
  const SYNONYMS: [string, string][] = [
    // DS-01 top-level folders
    ['percentage', 'percentages'],
    ['averages', 'averages'],
    ['average', 'averages'],
    ['problem on ages', 'ages'],
    ['problems on train', 'time-speed-distance'],
    ['problem on train', 'time-speed-distance'],
    ['trains', 'time-speed-distance'],
    ['profit & loss', 'profit-loss'],
    ['profit and loss', 'profit-loss'],
    ['number system', 'number-system'],
    ['ratio and proportion', 'ratio-proportion'],
    ['time, speed and distance', 'time-speed-distance'],
    ['time and work', 'time-work'],
    // DS-07 common topic phrases (TCS OA file)
    ['simple interest', 'percentages'],
    ['compound interest', 'percentages'],
    ['hcf & lcm', 'number-system'],
    ['hcf and lcm', 'number-system'],
    ['divisibility', 'number-system'],
    ['remainders', 'number-system'],
    ['pipes and cisterns', 'time-work'],
    ['boats and streams', 'time-speed-distance'],
    ['linear equations', 'number-system'],
    ['quadratic equations', 'number-system'],
    ['progressions', 'number-series'],
    ['logarithms', 'number-system'],
    ['blood relations', 'logical-reasoning'],
    ['seating arrangement', 'arrangements'],
    ['seating arrangements', 'arrangements'],
    ['coding-decoding', 'logical-reasoning'],
    ['direction sense', 'logical-reasoning'],
    ['syllogisms', 'logical-reasoning'],
    ['statement & conclusion', 'logical-reasoning'],
    ['cause & effect', 'logical-reasoning'],
    ['data sufficiency', 'data-interpretation'],
    ['calendar', 'logical-reasoning'],
    ['clock', 'logical-reasoning'],
    ['puzzle-based reasoning', 'logical-reasoning'],
    ['input-output', 'logical-reasoning'],
    ['pattern recognition', 'logical-reasoning'],
    ['reading comprehension', 'reading-comprehension'],
    ['para jumbles', 'grammar-vocabulary'],
    ['sentence completion', 'grammar-vocabulary'],
    ['fill in the blanks', 'grammar-vocabulary'],
    ['synonyms', 'grammar-vocabulary'],
    ['antonyms', 'grammar-vocabulary'],
    ['error detection', 'grammar-vocabulary'],
    ['active & passive voice', 'grammar-vocabulary'],
    ['direct & indirect speech', 'grammar-vocabulary'],
    ['vocabulary', 'grammar-vocabulary'],
    ['grammar', 'grammar-vocabulary'],
    ['idioms & phrases', 'grammar-vocabulary'],
    ['probability', 'probability'],
    ['permutations & combinations', 'permutations-combinations'],
    ['permutations and combinations', 'permutations-combinations'],
    ['pie charts', 'data-interpretation'],
    ['bar graphs', 'data-interpretation'],
    ['line charts', 'data-interpretation'],
    ['caselets', 'data-interpretation'],
    ['mixtures and allegations', 'percentages'],
  ];
  let synCount = 0;
  for (const [phrase, slug] of SYNONYMS) {
    const topicId = topicIdBySlug.get(slug);
    if (!topicId) continue;
    await prisma.topicSynonym.upsert({
      where: { phrase },
      update: { topicId },
      create: { phrase, topicId },
    });
    synCount += 1;
  }
  console.log(`seed: topic_synonyms — ${synCount} rows`);

  for (const e of ERROR_TYPES) {
    await prisma.errorType.upsert({
      where: { id: e.id },
      update: { code: e.code, label: e.label, category: e.category },
      create: e,
    });
  }
  console.log(`seed: error_types — ${ERROR_TYPES.length} rows`);

  // PH2-T07 — generic fallback blueprint. Every field is sourced to an
  // 'assumption' record at low confidence: the blueprint exists so unknown
  // assessments still produce a plan, and P-02 must show the unverified
  // notice for it.
  const genericQuant = [
    ['percentages', 0.2],
    ['ratio-proportion', 0.15],
    ['time-speed-distance', 0.15],
    ['time-work', 0.15],
    ['permutations-combinations', 0.1],
    ['probability', 0.15],
    ['number-series', 0.1],
  ] as const;
  await seedBlueprint({
    slug: 'generic',
    company: 'Aptiva',
    name: 'Generic Placement Blueprint',
    sources: [
      {
        key: 'primary',
        sourceType: 'assumption',
        reference: 'Aptiva generic fallback blueprint (playbook Section 4)',
        confidence: 'low',
      },
    ],
    sections: [
      {
        name: 'Quantitative Aptitude',
        orderNo: 1,
        durationMin: 20,
        questionCountMin: 10,
        questionCountMax: 14,
        negativeMarking: 0.25,
        formatMix: { mcq: 0.75, numerical: 0.25 },
        source: 'primary',
        weights: genericQuant.map(([topic, share], i) => ({
          topic,
          share,
          difficultyBand: i < 3 ? 2 : 1,
          paceSeconds: 90,
          source: 'primary',
        })),
      },
      {
        name: 'Logical Reasoning',
        orderNo: 2,
        durationMin: 15,
        questionCountMin: 8,
        questionCountMax: 12,
        negativeMarking: 0.25,
        formatMix: { mcq: 1, numerical: 0 },
        source: 'primary',
        weights: [
          {
            topic: 'logical-reasoning',
            share: 0.6,
            difficultyBand: 2,
            paceSeconds: 75,
            source: 'primary',
          },
          {
            topic: 'arrangements',
            share: 0.4,
            difficultyBand: 2,
            paceSeconds: 90,
            source: 'primary',
          },
        ],
      },
      {
        name: 'Data Interpretation',
        orderNo: 3,
        durationMin: 15,
        questionCountMin: 6,
        questionCountMax: 10,
        negativeMarking: null,
        formatMix: { mcq: 0.5, numerical: 0.5 },
        source: 'primary',
        weights: [
          {
            topic: 'data-interpretation',
            share: 1,
            difficultyBand: 2,
            paceSeconds: 120,
            source: 'primary',
          },
        ],
      },
      {
        name: 'Verbal Ability',
        orderNo: 4,
        durationMin: 15,
        questionCountMin: 8,
        questionCountMax: 12,
        negativeMarking: 0.25,
        formatMix: { mcq: 1, numerical: 0 },
        source: 'primary',
        weights: [
          {
            topic: 'reading-comprehension',
            share: 0.6,
            difficultyBand: 2,
            paceSeconds: 90,
            source: 'primary',
          },
          {
            topic: 'grammar-vocabulary',
            share: 0.4,
            difficultyBand: 1,
            paceSeconds: 60,
            source: 'primary',
          },
        ],
      },
    ],
  });

  // Sample company blueprint — provenance is deliberately mixed so P-02
  // demonstrates the badge system: structure from candidate reports,
  // topic weights from our pattern inference.
  await seedBlueprint({
    slug: 'sample-it-company',
    company: 'Sample IT Company',
    name: 'Sample IT Company Online Assessment',
    sources: [
      {
        key: 'primary',
        sourceType: 'candidate_reported',
        reference: 'Candidate-reported patterns collated from public forums',
        confidence: 'low',
      },
      {
        key: 'secondary',
        sourceType: 'pattern_inferred',
        reference: 'Aptiva topic-weight inference from the reported section mix',
        confidence: 'low',
      },
    ],
    sections: [
      {
        name: 'Quantitative Aptitude',
        orderNo: 1,
        durationMin: 25,
        questionCountMin: 12,
        questionCountMax: 16,
        negativeMarking: 0.25,
        formatMix: { mcq: 0.7, numerical: 0.3 },
        source: 'primary',
        weights: genericQuant.map(([topic, share], i) => ({
          topic,
          share: share * (i === 0 ? 1.4 : 0.9),
          difficultyBand: 2,
          paceSeconds: 85,
          source: 'secondary',
        })),
      },
      {
        name: 'Logical Reasoning',
        orderNo: 2,
        durationMin: 20,
        questionCountMin: 10,
        questionCountMax: 14,
        negativeMarking: null,
        formatMix: { mcq: 1, numerical: 0 },
        source: 'primary',
        weights: [
          {
            topic: 'logical-reasoning',
            share: 0.5,
            difficultyBand: 2,
            paceSeconds: 80,
            source: 'secondary',
          },
          {
            topic: 'arrangements',
            share: 0.5,
            difficultyBand: 3,
            paceSeconds: 100,
            source: 'secondary',
          },
        ],
      },
      {
        name: 'Verbal Ability',
        orderNo: 3,
        durationMin: 15,
        questionCountMin: 8,
        questionCountMax: 12,
        negativeMarking: 0.25,
        formatMix: { mcq: 1, numerical: 0 },
        source: 'primary',
        weights: [
          {
            topic: 'reading-comprehension',
            share: 0.7,
            difficultyBand: 2,
            paceSeconds: 100,
            source: 'secondary',
          },
          {
            topic: 'grammar-vocabulary',
            share: 0.3,
            difficultyBand: 1,
            paceSeconds: 55,
            source: 'secondary',
          },
        ],
      },
    ],
  });
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
