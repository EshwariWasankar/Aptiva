import { describe, expect, it } from 'vitest';
import { ApiErrorBodySchema, HealthDataSchema, successEnvelope } from '../src/index.js';

describe('@aptiva/shared schemas', () => {
  it('parses a health payload', () => {
    expect(HealthDataSchema.parse({ status: 'ok' })).toEqual({ status: 'ok' });
  });

  it('parses an error envelope', () => {
    const body = {
      error: { code: 'NOT_FOUND', message: 'missing', requestId: 'req_1' },
    };
    expect(ApiErrorBodySchema.parse(body).error.code).toBe('NOT_FOUND');
  });

  it('rejects unknown error codes', () => {
    const body = {
      error: { code: 'BOGUS', message: 'x', requestId: 'req_1' },
    };
    expect(() => ApiErrorBodySchema.parse(body)).toThrow();
  });

  it('builds a success envelope schema', () => {
    const schema = successEnvelope(HealthDataSchema);
    expect(schema.parse({ data: { status: 'ok' }, meta: { requestId: 'req_1' } })).toBeDefined();
  });
});
