import { describe, expect, it } from 'vitest';
import { buildSplits, parseRupees } from './money';

describe('custom shares', () => {
  it('parses exact paisa and preserves unequal amounts', () => {
    expect(parseRupees(' 100.05 ')).toBe(10005);
    expect(buildSplits(60000, ['a', 'b', 'c'], [
      { userId: 'c', sharePaisa: 30000 }, { userId: 'a', sharePaisa: 10000 }, { userId: 'b', sharePaisa: 20000 }
    ])).toEqual([{ userId: 'a', sharePaisa: 10000 }, { userId: 'b', sharePaisa: 20000 }, { userId: 'c', sharePaisa: 30000 }]);
  });
  it('rejects mismatches, missing people, duplicate people and invalid numbers', () => {
    expect(() => buildSplits(100, ['a', 'b'], [{ userId: 'a', sharePaisa: 50 }, { userId: 'b', sharePaisa: 49 }])).toThrow();
    expect(() => buildSplits(100, ['a', 'b'], [{ userId: 'a', sharePaisa: 100 }])).toThrow();
    expect(() => buildSplits(100, ['a', 'b'], [{ userId: 'a', sharePaisa: 50 }, { userId: 'a', sharePaisa: 50 }])).toThrow();
    for (const value of [-1, 1.5, NaN, Infinity]) expect(() => buildSplits(100, ['a'], [{ userId: 'a', sharePaisa: value }])).toThrow();
    for (const text of ['-1', '1.234', '1e3', '9007199254740991', '']) expect(() => parseRupees(text)).toThrow();
  });
  it('allows an explicitly zero share without distributing extra debt', () => {
    expect(buildSplits(100, ['a', 'b'], [{ userId: 'a', sharePaisa: 0 }, { userId: 'b', sharePaisa: 100 }])[0].sharePaisa).toBe(0);
  });
});
