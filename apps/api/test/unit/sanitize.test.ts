import { describe, expect, it } from 'vitest';
import { normaliseStem, sanitizeContent, stemHash } from '../../src/common/sanitize';

/** T-020 — admin-authored HTML is sanitised server-side. */
describe('sanitizeContent', () => {
  it('strips script tags and event handlers', () => {
    const dirty = `<p>Hello</p><script>alert(1)</script><img src=x onerror=alert(2)>`;
    const clean = sanitizeContent(dirty);
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');
    expect(clean).toContain('<p>Hello</p>');
  });

  it('neutralises javascript: URLs', () => {
    const clean = sanitizeContent('<a href="javascript:alert(1)">x</a>');
    expect(clean).not.toContain('javascript:');
  });

  it('keeps the allowed formatting subset', () => {
    const clean = sanitizeContent('<b>bold</b> <i>it</i> <sub>2</sub> <code>x=1</code>');
    expect(clean).toContain('<b>bold</b>');
    expect(clean).toContain('<sub>2</sub>');
    expect(clean).toContain('<code>x=1</code>');
  });
});

describe('stemHash', () => {
  it('is stable across formatting and case differences', () => {
    expect(stemHash('<b>What is 2+2?</b>')).toBe(stemHash('what   is 2+2?'));
    expect(stemHash('a')).not.toBe(stemHash('b'));
  });

  it('normaliseStem strips tags', () => {
    expect(normaliseStem('<p>Hi <b>there</b></p>')).toBe('hi there');
  });
});
