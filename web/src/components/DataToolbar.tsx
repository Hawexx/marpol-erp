import type { ReactNode } from 'react';
import { Button, Input } from '@ui5/webcomponents-react';

/**
 * Liste sayfalarinin ustundeki arama + islem cubugu.
 * UI5 Toolbar yalnizca ToolbarItem turevlerini kabul ettigi icin
 * serbest icerik barindirabilen duz bir flex satiri kullanilir.
 */
export function DataToolbar({
  search,
  onSearchChange,
  onRefresh,
  onCreate,
  createLabel = 'Yeni',
  canCreate = true,
  extra,
  count,
  onExport,
  exportBusy,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onCreate?: () => void;
  createLabel?: string;
  canCreate?: boolean;
  extra?: ReactNode;
  count?: number;
  /** Verilirse "Dışa Aktar" butonu gosterilir. */
  onExport?: () => void;
  exportBusy?: boolean;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        flexWrap: 'wrap',
        padding: '0.5rem 0',
        marginBottom: '0.25rem',
      }}
    >
      <Input
        placeholder="Ara..."
        value={search}
        onInput={(e) => onSearchChange(e.target.value)}
        style={{ width: '260px' }}
      />
      {count !== undefined && (
        <span style={{ color: 'var(--sapContent_LabelColor)', fontSize: '0.875rem' }}>
          {count} kayıt
        </span>
      )}
      <div style={{ flex: 1 }} />
      {extra}
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
      <Button design="Transparent" icon="refresh" onClick={onRefresh}>
        Yenile
      </Button>
      {onCreate && canCreate && (
        <Button design="Emphasized" icon="add" onClick={onCreate}>
          {createLabel}
        </Button>
      )}
    </div>
  );
}
