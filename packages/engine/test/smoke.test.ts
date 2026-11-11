import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION, engineVersion } from '../src/index.js';

describe('@aptiva/engine', () => {
  it('exposes a version marker', () => {
    expect(engineVersion()).toBe(ENGINE_VERSION);
    expect(engineVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
