/**
 * CSV disa aktarma.
 *
 * Excel'in Turkce yerel ayarinda sutunlari dogru ayirabilmesi icin ayirici
 * olarak noktali virgul kullanilir ve dosyanin basina BOM eklenir (aksi halde
 * Turkce karakterler bozuk gorunur).
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const SEPARATOR = ';';

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // Ayirici, tirnak veya satir sonu iceren hucreler tirnaklanir.
  if (text.includes(SEPARATOR) || text.includes('"') || /[\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => escapeCell(c.header)).join(SEPARATOR);
  const body = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(SEPARATOR));
  return [head, ...body].join('\r\n');
}

/** Olusturulan CSV'yi indirir. */
export function downloadCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]): void {
  const csv = buildCsv(rows, columns);
  // BOM: Excel dosyayi UTF-8 olarak tanisin.
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Dosya adina tarih damgasi ekler: "uretim-emirleri-2026-08-26.csv" */
export function stampedFileName(base: string): string {
  const now = new Date();
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  return `${base}-${stamp}.csv`;
}
