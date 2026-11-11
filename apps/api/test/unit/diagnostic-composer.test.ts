import { describe, expect, it } from 'vitest';
import { composeDiagnostic, type ComposerCandidate } from '../../src/diagnostic/composer';

/** PH5-T02 — composer quotas, disjointness inputs, deterministic output. */

const SECTIONS = ['s1', 's2', 's3', 's4'];

function candidates(n: number, perSection = true): ComposerCandidate[] {
  const out: ComposerCandidate[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      id: `q${String(i).padStart(3, '0')}`,
      sectionId: perSection ? SECTIONS[i % 4]! : SECTIONS[0]!,
      difficultyPrior: (i % 3) + 1,
    });
  }
  return out;
}

describe('composeDiagnostic', () => {
  it('returns null when the pool is below the mode total', () => {
    expect(composeDiagnostic(candidates(11), 'express')).toBeNull();
    expect(composeDiagnostic(candidates(26), 'standard')).toBeNull();
  });

  it('express picks exactly 12 unique ids across sections', () => {
    const r = composeDiagnostic(candidates(40), 'express');
    expect(r).not.toBeNull();
    expect(r!.questionIds).toHaveLength(12);
    expect(new Set(r!.questionIds).size).toBe(12);
    expect(r!.shortSections).toHaveLength(0);
  });

  it('standard picks exactly 27 unique ids', () => {
    const r = composeDiagnostic(candidates(80), 'standard');
    expect(r!.questionIds).toHaveLength(27);
    expect(new Set(r!.questionIds).size).toBe(27);
  });

  it('is deterministic for the same candidate set', () => {
    const c = candidates(40);
    const a = composeDiagnostic(c, 'express')!.questionIds;
    const b = composeDiagnostic([...c].reverse(), 'express')!.questionIds;
    expect(a).toEqual(b);
  });

  it('flags short sections instead of failing when a section is thin', () => {
    // 20 questions all in s1, 12 in s2 → express still composes, s3/s4 absent.
    const thin: ComposerCandidate[] = [
      ...candidates(20).map((c, i) => ({ ...c, sectionId: 's1', id: `a${i}` })),
      ...candidates(12).map((c, i) => ({ ...c, sectionId: 's2', id: `b${i}` })),
    ];
    const r = composeDiagnostic(thin, 'express');
    expect(r).not.toBeNull();
    expect(r!.questionIds).toHaveLength(12);
  });
});
