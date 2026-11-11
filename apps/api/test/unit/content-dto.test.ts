import { describe, expect, it } from 'vitest';
import {
  BlueprintBodySchema,
  BlueprintCreateSchema,
  QuestionUpsertSchema,
} from '../../src/content/dto';

const UUID = '123e4567-e89b-42d3-a456-426614174000';

const validMcq = {
  topicId: UUID,
  format: 'mcq',
  stem: 'What is 2 + 2?',
  difficultyPrior: 1,
  expectedTimeMs: 60_000,
  options: [
    { text: '3', isCorrect: false },
    { text: '4', isCorrect: true },
    { text: '5', isCorrect: false },
  ],
};

describe('QuestionUpsertSchema (E-060)', () => {
  it('accepts a valid MCQ', () => {
    const r = QuestionUpsertSchema.safeParse(validMcq);
    expect(r.success).toBe(true);
  });

  it('rejects non-numeric tolerance strings', () => {
    const r = QuestionUpsertSchema.safeParse({
      ...validMcq,
      format: 'numerical',
      numericAnswer: 'abc',
    });
    expect(r.success).toBe(false);
  });

  it('accepts numeric answer as number or decimal string', () => {
    expect(
      QuestionUpsertSchema.safeParse({ ...validMcq, format: 'numerical', numericAnswer: 15.5 })
        .success,
    ).toBe(true);
    expect(
      QuestionUpsertSchema.safeParse({ ...validMcq, format: 'numerical', numericAnswer: '15.5' })
        .success,
    ).toBe(true);
    expect(
      QuestionUpsertSchema.safeParse({ ...validMcq, format: 'numerical', numericAnswer: '15,5' })
        .success,
    ).toBe(false);
  });

  it('rejects out-of-range difficulty and missing stem', () => {
    expect(QuestionUpsertSchema.safeParse({ ...validMcq, difficultyPrior: 4 }).success).toBe(false);
    expect(QuestionUpsertSchema.safeParse({ ...validMcq, stem: '' }).success).toBe(false);
  });
});

describe('Blueprint schemas (E-064)', () => {
  const validBody = {
    sources: [{ sourceType: 'official', confidence: 'high', reference: 'handbook' }],
    sections: [
      {
        name: 'Quant',
        orderNo: 1,
        weights: [{ topicSlug: 'percentages', share: 1 }],
      },
    ],
  };

  it('accepts a minimal blueprint body', () => {
    expect(BlueprintBodySchema.safeParse(validBody).success).toBe(true);
  });

  it('create requires slug, company and name', () => {
    expect(BlueprintCreateSchema.safeParse(validBody).success).toBe(false);
    expect(
      BlueprintCreateSchema.safeParse({
        ...validBody,
        slug: 'TCS NQT!',
        company: 'TCS',
        name: 'NQT',
      }).success,
    ).toBe(false);
    expect(
      BlueprintCreateSchema.safeParse({
        ...validBody,
        slug: 'tcs-nqt',
        company: 'TCS',
        name: 'NQT',
      }).success,
    ).toBe(true);
  });
});
