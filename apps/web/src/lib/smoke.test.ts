import { describe, expect, it } from 'vitest';
import { HealthDataSchema } from '@aptiva/shared';

describe('workspace smoke', () => {
  it('web can import @aptiva/shared schemas', () => {
    expect(HealthDataSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });
});
