import type { ReactNode } from 'react';
import type { AnalyticalTableColumnDefinition } from '@ui5/webcomponents-react';

export type Column = AnalyticalTableColumnDefinition;

/* eslint-disable @typescript-eslint/no-explicit-any */
/** AnalyticalTable'in Cell fonksiyonuna gecirdigi degerler. */
export interface CellRenderProps<T> {
  value: any;
  row: { original: T };
}

/**
 * Sutun tanimi - kutuphane `Cell` fonksiyonunu genel `CellInstance` ile
 * tiplerken, sayfalarda satirin gercek tipiyle calisabilmek icin daraltilir.
 */
export interface ColumnDef<T> extends Omit<Column, 'Cell'> {
  Cell?: (props: CellRenderProps<T>) => ReactNode;
}

/** Sayfa sutunlarini AnalyticalTable'in bekledigi tipe cevirir. */
export function columns<T>(defs: ColumnDef<T>[]): Column[] {
  return defs as unknown as Column[];
}

/**
 * Tum liste tablolarinin ortak ayarlari.
 *
 * Onceden her sayfa kendi `visibleRows` degerini yaziyordu (12/13/14/15);
 * sayfalar arasi gecise ~130px'lik bir ziplama olarak yansiyordu. Tek deger.
 *
 * `minRows` varsayilani 5'tir: bir filtre az sonuc dondurdugunde tablo
 * cokuyor ve altindaki sayfalayici yukari ziplyordu. visibleRows ile
 * esitlenerek tablo yuksekligi sabit tutuluyor.
 *
 * `rowHeight` ACIKCA verilir: verilmezse AnalyticalTable yuksekligi DOM'dan
 * olcmeye calisir, ilk render'da tablo referansi henuz null oldugu icin
 * document.body uzerinden 44px okur ve tablo bir kare titrer.
 */
export const TABLE_DEFAULTS = {
  rowHeight: 36,
  headerRowHeight: 40,
  visibleRows: 12,
  minRows: 12,
  loadingDelay: 300,
  alternateRowColor: true,
} as const;

/*
 * `withRowHighlight` BILEREK burada yok.
 *
 * Acildiginda AnalyticalTable satirlarin basina accessor="status" olan
 * fazladan bir sutun ekliyor. Bu iki sorun cikariyor:
 *   1. OrderListPage'in kendi "Durum" sutunu da accessor="status" kullaniyor;
 *      kutuphane bu durumda cakisma uyarisi veriyor.
 *   2. Diger tablolarin satirlarinda `status` alani yok - hepsinde bos ve
 *      anlamsiz bir sutun aciliyor.
 * Satir vurgusu yalnizca anlamli oldugu yerde, uygun bir `highlightField`
 * ile birlikte aciliyor (bkz. OrderListPage).
 */

/**
 * Satir sonundaki islem butonlari sutunu.
 *
 * Genislik dort ayri sayfada 90 / 100 / 110 / 210px olarak yazilmisti;
 * buton sayisindan turetilir: her buton 2.25rem + kenar dolgusu.
 */
export function actionColumn<T>(buttonCount: number, extra?: Partial<ColumnDef<T>>): ColumnDef<T> {
  return {
    Header: 'İşlem',
    id: 'actions',
    width: buttonCount * 36 + 24,
    disableFilters: true,
    disableSortBy: true,
    disableResizing: true,
    ...extra,
  } as ColumnDef<T>;
}
