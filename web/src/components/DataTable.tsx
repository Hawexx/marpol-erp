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
/**
 * Tablo yuksekligi satir sayisina uyar ama iki uctan da sinirlanir.
 *
 * Sabit `visibleRows: 12` verildiginde uc kayitlik bir tabloda dokuz bos
 * dolgu satiri cikiyordu. Sadece veri kadar yukseklik vermek de olmaz:
 * bir filtre tek sonuc dondurdugunde tablo cokup altindaki sayfalayici
 * yukari ziplar. Taban 5, tavan 12.
 */
const MIN_ROWS = 5;
const MAX_ROWS = 12;

export function DataTable(props: AnalyticalTableProps) {
  const satirSayisi = Array.isArray(props.data) ? props.data.length : 0;
  const visibleRows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, satirSayisi));

  return (
    <div className="ui5-content-density-compact mp-datatable">
      <AnalyticalTable
        {...TABLE_DEFAULTS}
        visibleRows={visibleRows}
        minRows={MIN_ROWS}
        {...props}
      />
    </div>
  );
}
