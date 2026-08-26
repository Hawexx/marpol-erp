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
