/**
 * Diagnostic-pool curation (PH5-T02 support).
 *
 * The composer needs ~27 published diagnostic-pool items across the four
 * sections with a 30/45/25 difficulty mix. Banked items arrive as drafts
 * (or reviewed) in the practice pool; this script promotes a diverse,
 * deterministic slice into pool='diagnostic' + status='published'.
 *
 * Rules honoured:
 *  - only items WITH sourceName are promoted (published_needs_source)
 *  - pools stay disjoint — an item leaves 'practice' when promoted
 *  - prefers 'reviewed' over 'draft', spreads across sections/bands/formats
 *  - idempotent: already-diagnostic items are untouched; re-running tops up
 *
 * Run: `pnpm db:seed-diagnostic` (loads apps/api/.env; needs DATABASE_URL).
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

const TARGET = 40; // headroom over the 27-item standard diagnostic

async function main() {
  const topics = await prisma.topic.findMany();
  const byId = new Map(topics.map((t) => [t.id, t]));
  const sectionOf = (topicId: string): string => {
    let cur = byId.get(topicId);
    let hops = 0;
    while (cur?.parentId && hops++ < 5) cur = byId.get(cur.parentId);
    return cur?.level === 'section' ? cur.id : '';
  };

  const existingDiag = await prisma.question.count({ where: { pool: 'diagnostic' } });
  const need = Math.max(0, TARGET - existingDiag);
  if (need === 0) {
    console.log(`diagnostic pool already at target (${existingDiag})`);
    return;
  }

  const candidates = await prisma.question.findMany({
    where: {
      pool: { not: 'diagnostic' },
      sourceName: { not: null },
      status: { in: ['draft', 'reviewed'] },
    },
    select: {
      id: true,
      topicId: true,
      difficultyPrior: true,
      format: true,
      status: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Group by (section, band, format) and round-robin for diversity.
  const buckets = new Map<string, typeof candidates>();
  for (const q of candidates) {
    const key = `${sectionOf(q.topicId)}|${q.difficultyPrior}|${q.format}`;
    const list = buckets.get(key) ?? [];
    list.push(q);
    buckets.set(key, list);
  }
  // Reviewed items first within each bucket.
  for (const list of buckets.values()) {
    list.sort((a, b) => (a.status === b.status ? 0 : a.status === 'reviewed' ? -1 : 1));
  }
  const keys = [...buckets.keys()].sort();
  const picked: typeof candidates = [];
  const seen = new Set<string>();
  while (picked.length < need) {
    let progressed = false;
    for (const k of keys) {
      const list = buckets.get(k)!;
      while (list.length && seen.has(list[0]!.id)) list.shift();
      const q = list.shift();
      if (!q) continue;
      seen.add(q.id);
      picked.push(q);
      progressed = true;
      if (picked.length >= need) break;
    }
    if (!progressed) break;
  }

  if (picked.length === 0) {
    console.log('no promotable questions found (need sourceName + draft/reviewed status)');
    return;
  }
  await prisma.question.updateMany({
    where: { id: { in: picked.map((q) => q.id) } },
    data: { pool: 'diagnostic', status: 'published' },
  });

  const bySection = new Map<string, number>();
  const byBand = new Map<number, number>();
  for (const q of picked) {
    const s = sectionOf(q.topicId) || 'unsectioned';
    bySection.set(s, (bySection.get(s) ?? 0) + 1);
    byBand.set(q.difficultyPrior, (byBand.get(q.difficultyPrior) ?? 0) + 1);
  }
  console.log(`promoted ${picked.length} questions to diagnostic pool:`);
  console.log('  sections:', Object.fromEntries(bySection));
  console.log('  bands:', Object.fromEntries(byBand));
  console.log(`  formats:`, {
    mcq: picked.filter((q) => q.format === 'mcq').length,
    numerical: picked.filter((q) => q.format === 'numerical').length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
