import { describe, expect, it } from 'vitest';
import { REPLAY_TOOL_VERSION } from '../src/index.js';

describe('@aptiva/replay', () => {
  it('exposes a version marker', () => {
    expect(REPLAY_TOOL_VERSION).toBe('0.0.0');
  });
});
