import { describe, expect, it } from 'vitest';
import { assertNoDuplicates, assertRatioTotal } from './schemaHelpers.js';
import { ApiError } from './http.js';

describe('assertRatioTotal', () => {
  it('%100 toplayan oranlari kabul eder', () => {
    expect(() => assertRatioTotal([{ ratio: 60 }, { ratio: 40 }])).not.toThrow();
  });

  it('bos listeyi kabul eder (oran girilmemis demektir)', () => {
    expect(() => assertRatioTotal([])).not.toThrow();
  });

  it('kayan nokta yuvarlamasina tolerans gosterir', () => {
    // 1/3 + 1/3 + 1/3 tam 100 etmez; kural bunu reddetmemeli.
    expect(() =>
      assertRatioTotal([{ ratio: 33.33 }, { ratio: 33.33 }, { ratio: 33.34 }]),
    ).not.toThrow();
  });

  it('eksik toplami reddeder', () => {
    expect(() => assertRatioTotal([{ ratio: 60 }, { ratio: 30 }])).toThrow(ApiError);
  });

  it('fazla toplami reddeder', () => {
    expect(() => assertRatioTotal([{ ratio: 60 }, { ratio: 60 }])).toThrow(ApiError);
  });

  it('hata mesajinda gercek toplami bildirir', () => {
    try {
      assertRatioTotal([{ ratio: 90 }]);
      throw new Error('hata bekleniyordu');
    } catch (err) {
      expect((err as ApiError).message).toContain('90.00');
      expect((err as ApiError).status).toBe(400);
    }
  });

  it('etiketi mesaja yansitir', () => {
    try {
      assertRatioTotal([{ ratio: 10 }], 'Kumas kimyasal oranlarinin');
      throw new Error('hata bekleniyordu');
    } catch (err) {
      expect((err as ApiError).message).toContain('Kumas kimyasal oranlarinin');
    }
  });
});

describe('assertNoDuplicates', () => {
  it('benzersiz kayitlari kabul eder', () => {
    expect(() =>
      assertNoDuplicates([{ id: 'a' }, { id: 'b' }], (r) => r.id, 'Kimyasal'),
    ).not.toThrow();
  });

  it('tekrarlanan kaydi reddeder', () => {
    expect(() =>
      assertNoDuplicates([{ id: 'a' }, { id: 'a' }], (r) => r.id, 'Kimyasal'),
    ).toThrow(ApiError);
  });

  it('bos listeyi kabul eder', () => {
    expect(() => assertNoDuplicates([], (r: { id: string }) => r.id, 'Kimyasal')).not.toThrow();
  });
});
