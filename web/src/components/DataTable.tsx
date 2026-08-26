import { AnalyticalTable } from '@ui5/webcomponents-react';
import type { ComponentProps } from 'react';
import { TABLE_DEFAULTS } from './table.js';

type AnalyticalTableProps = ComponentProps<typeof AnalyticalTable>;

/**
 * Projedeki tum liste tablolarinin ortak sarmalayicisi.
 *
 * YOGUNLUK: UI5 React'te icerik yogunlugu bir ThemeProvider prop'u degil bir
 * CSS SINIFI - `ui5-content-density-compact` degiskenleri ezerek satir
 * yuksekligini 44px'ten 32px'e cekiyor. Sinif bilerek sayfanin tamamina degil
 * yalnizca tablonun sarmalayicisina veriliyor: formlar ve diyaloglar rahat
 * (cozy) olcude kaliyor, veri yogun tablolar sikisiyor.
 *
 * OLCULER: rowHeight/headerRowHeight ACIKCA veriliyor. Verilmediginde
 * AnalyticalTable yuksekligi DOM'dan olcmeye calisir; ilk render'da tablo
 * referansi henuz null oldugu icin document.body uzerinden okur ve tablo
 * ilk karede titrer.
 */
export function DataTable(props: AnalyticalTableProps) {
  return (
    <div className="ui5-content-density-compact mp-datatable">
      <AnalyticalTable {...TABLE_DEFAULTS} {...props} />
    </div>
  );
}
