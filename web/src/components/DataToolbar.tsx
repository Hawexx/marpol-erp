import type { ReactNode } from 'react';
import { Button, Input } from '@ui5/webcomponents-react';

/**
 * Liste sayfalarinin ustundeki arama + filtre + islem cubugu.
 *
 * UI5 Toolbar yalnizca ToolbarItem turevlerini kabul ettigi icin serbest
 * icerik barindirabilen duz bir flex satiri kullanilir.
 *
 * ANATOMI: sol tarafta ARAMA ve FILTRELER, sag tarafta EYLEMLER.
 * Onceki surumde tek bir `extra` yuvasi vardi ve bosluk doldurucudan SONRA
 * ciziliyordu; sayfalarin oraya verdigi durum/aciliyet filtreleri saga,
 * "Disa Aktar" ile "Yenile" butonlarinin arasina dusuyordu. Iki ayri yuva
 * (`filters` / `actions`) bunu yapisal olarak imkansiz kiliyor.
 *
 * Erisilebilirlik notu: role="toolbar" BILEREK kullanilmiyor - o rol ok
 * tuslariyla gezinen "roving tabindex" davranisini sart kosar; burada
 * kontroller normal sekme sirasinda geziliyor.
 */
export function DataToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Ara...',
  onRefresh,
  onCreate,
  createLabel = 'Yeni',
  canCreate = true,
  /** Aramanin yanina, SOLA eklenecek filtre kontrolleri. */
  filters,
  /** Yenile/Yeni butonlarinin yanina, SAGA eklenecek ek eylemler. */
  actions,
  count,
  /** Verilirse "Disa Aktar" butonu gosterilir. */
  onExport,
  exportBusy,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  onRefresh: () => void;
  onCreate?: () => void;
  createLabel?: string;
  canCreate?: boolean;
  filters?: ReactNode;
  actions?: ReactNode;
  count?: number;
  onExport?: () => void;
  exportBusy?: boolean;
}) {
  return (
    <div className="mp-toolbar" role="group" aria-label="Liste araçları">
      <div className="mp-toolbar__side">
        <Input
          placeholder={searchPlaceholder}
          value={search}
          onInput={(e) => onSearchChange(e.target.value)}
          className="mp-toolbar__search"
        />
        {count !== undefined && <span className="mp-toolbar__count">{count} kayıt</span>}
        {filters}
      </div>

      <div className="mp-toolbar__side mp-toolbar__side--end">
        {actions}
        {onExport && (
          <Button
            design="Transparent"
            icon="excel-attachment"
            disabled={exportBusy}
            onClick={onExport}
          >
            {exportBusy ? 'Hazırlanıyor...' : 'Dışa Aktar'}
          </Button>
        )}
        {/* Ikon-only: etiket cubukta yer kapliyordu, anlami ikondan acik. */}
        <Button design="Transparent" icon="refresh" tooltip="Yenile" onClick={onRefresh} />
        {onCreate && canCreate && (
          <Button design="Emphasized" icon="add" onClick={onCreate}>
            {createLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
