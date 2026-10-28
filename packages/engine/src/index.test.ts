import { describe, it, expect } from 'vitest';
import { helloEngine } from './index';

describe('Engine Package', () => {
  it('should return hello message', () => {
    expect(helloEngine()).toBe('Engine package initialized');
  });
});
