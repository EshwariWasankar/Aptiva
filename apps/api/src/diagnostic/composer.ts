/**
 * Diagnostic composer (PH5-T02): selects published diagnostic-pool
 * questions across the four sections with a 30/45/25 easy/medium/hard
 * mix. Standard = 27 items (~30 min), express = 12 (~10–15 min).
 * Deterministic: candidates are ordered by id before selection.
 */

export interface ComposerCandidate {
  id: string;
  /** root section topic id (level='section') */
  sectionId: string;
  difficultyPrior: number; // 1|2|3
}

export interface ComposeResult {
  questionIds: string[];
  /** sections that could not fill their quota (bank gaps) */
  shortSections: string[];
}

const TARGETS = {
  standard: { total: 27, sections: 4, perSection: [7, 7, 7, 6] },
  express: { total: 12, sections: 4, perSection: [3, 3, 3, 3] },
} as const;

/** difficulty quotas as [easy, medium, hard] counts per mode */
const DIFFICULTY_QUOTAS = {
  standard: [8, 12, 7], // ~30/45/25 of 27
  express: [4, 5, 3], // ~33/42/25 of 12
} as const;

export function composeDiagnostic(
  candidates: ComposerCandidate[],
  mode: 'standard' | 'express',
): ComposeResult | null {
  const t = TARGETS[mode];
  const quotas = DIFFICULTY_QUOTAS[mode];
  if (candidates.length < t.total) return null;

  const bySection = new Map<string, ComposerCandidate[]>();
  for (const c of [...candidates].sort((a, b) => a.id.localeCompare(b.id))) {
    const list = bySection.get(c.sectionId) ?? [];
    list.push(c);
    bySection.set(c.sectionId, list);
  }
  const sections = [...bySection.keys()].sort();
  if (sections.length < t.sections) {
    // Fewer distinct sections than required — still compose globally.
  }

  const picked: ComposerCandidate[] = [];
  const pickedIds = new Set<string>();
  const shortSections: string[] = [];

  // Per-section quotas, cycling sections in sorted order.
  const sectionQuota = new Map<string, number>();
  sections.forEach((s, i) => sectionQuota.set(s, t.perSection[i % t.perSection.length]!));

  // First pass: meet per-section quotas while favouring needed bands.
  const need = [...quotas];
  for (const s of sections) {
    const quota = sectionQuota.get(s)!;
    const pool = bySection.get(s)!;
    let taken = 0;
    // Prefer bands still needed, round-robin.
    while (taken < quota && pool.some((c) => !pickedIds.has(c.id))) {
      let progressed = false;
      for (let band = 0; band < 3; band++) {
        if (need[band]! <= 0) continue;
        const cand = pool.find((c) => !pickedIds.has(c.id) && c.difficultyPrior === band + 1);
        if (cand) {
          picked.push(cand);
          pickedIds.add(cand.id);
          need[band]!--;
          taken++;
          progressed = true;
          if (taken >= quota) break;
        }
      }
      if (!progressed) break;
    }
    if (taken < quota) shortSections.push(s);
  }

  // Second pass: fill remaining slots globally to hit total + band quotas.
  const remaining = [...candidates]
    .filter((c) => !pickedIds.has(c.id))
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const band of [0, 1, 2] as const) {
    while (need[band]! > 0) {
      const idx = remaining.findIndex((c) => c.difficultyPrior === band + 1);
      if (idx === -1) break;
      const c = remaining.splice(idx, 1)[0]!;
      picked.push(c);
      pickedIds.add(c.id);
      need[band]!--;
    }
  }
  // Top up to total if band quotas couldn't be met exactly.
  for (const c of remaining) {
    if (picked.length >= t.total) break;
    picked.push(c);
    pickedIds.add(c.id);
  }

  // Shuffle deterministically (seeded by sorted ids) so positions aren't
  // grouped by section/band.
  const ids = picked.map((c) => c.id).sort();
  const order = deterministicShuffle(ids);
  return { questionIds: order.map((id) => id), shortSections };
}

/** Fisher–Yates with a tiny deterministic PRNG seeded from the id list. */
function deterministicShuffle(ids: string[]): string[] {
  let seed = 0;
  for (const ch of ids.join('')) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const arr = [...ids];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}
