import { z } from 'zod';
import { badRequest } from './http.js';

/**
 * Rota semalarinda tekrarlanan alan tanimlari.
 *
 * Bu iki satir sekiz ayri rota dosyasinda birebir kopyalanmisti; birinde
 * yapilan degisiklik digerlerine tasinmiyordu.
 */

/** Bos birakilabilen serbest metin. */
export const text = z.string().trim().optional().nullable();

/** Bos birakilabilen, negatif olmayan sayi. */
export const num = z.coerce.number().nonnegative().optional().nullable();

/**
 * Yuzde oranlarinin toplaminin %100 oldugunu dogrular.
 *
 * Ayni kural uc yerde uc farkli sekilde ele aliniyordu: recete ve emir
 * kaydetmeyi engelliyor, kumas ise yalnizca uyarip kaydediyordu. Tek
 * kaynaga tasindi.
 */
export function assertRatioTotal(
  rows: { ratio: number }[],
  label = 'Kimyasal oranlarinin',
): void {
  if (rows.length === 0) return;

  const total = rows.reduce((sum, r) => sum + r.ratio, 0);
  if (Math.abs(total - 100) > 0.01) {
    throw badRequest(`${label} toplami %100 olmalidir. Su anki toplam: %${total.toFixed(2)}`);
  }
}

/** Ayni kaydin listede birden fazla kez yer almadigini dogrular. */
export function assertNoDuplicates<T>(rows: T[], key: (row: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const row of rows) {
    const id = key(row);
    if (seen.has(id)) {
      throw badRequest(`${label} listesinde ayni kayit birden fazla kez yer aliyor.`);
    }
    seen.add(id);
  }
}
