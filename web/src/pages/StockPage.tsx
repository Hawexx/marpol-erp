import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  CheckBox,
  Dialog,
  Input,
  Label,
  MessageStrip,
  ObjectStatus,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { useNotify } from '../components/NotificationProvider.js';
import { DataToolbar } from '../components/DataToolbar.js';
import { Pagination } from '../components/Pagination.js';
import { UiSelect } from '../components/UiSelect.js';
import { DataTable } from '../components/DataTable.js';
import { actionColumn, columns as tableColumns } from '../components/table.js';
import { useDebounced } from '../lib/useDebounced.js';
import { downloadCsv, stampedFileName, type CsvColumn } from '../lib/csv.js';
import { ListSection, PageHeader, STOCK_REASON_LABEL, formatDateTime, formatNumber } from '../components/ui.js';
import type { StockMovement, StockReason, StockRow } from '../api/types.js';

const PAGE_SIZE = 50;

const CSV_COLUMNS: CsvColumn<StockRow>[] = [
  { header: 'Kod', value: (r) => r.code },
  { header: 'Kimyasal', value: (r) => r.name },
  { header: 'Birim', value: (r) => r.unit },
  { header: 'Eldeki Miktar', value: (r) => r.stockQty },
  { header: 'Kritik Seviye', value: (r) => r.minStockQty },
  { header: 'Durum', value: (r) => (r.isLow ? 'Kritik' : 'Yeterli') },
  { header: 'Tedarikçi', value: (r) => r.supplier },
];

/** Girisi artiran sebepler; formda yon bilgisi olarak gosterilir. */
const INCOMING: StockReason[] = ['GIRIS', 'IADE'];

export default function StockPage() {
  const { can } = useAuth();
  const { toast, error: showError } = useNotify();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [page, setPage] = useState(1);
  const [exportBusy, setExportBusy] = useState(false);
  const [moveForm, setMoveForm] = useState<{
    chemical: StockRow;
    reason: StockReason;
    quantity: string;
    note: string;
  } | null>(null);
  const [countForm, setCountForm] = useState<{
    chemical: StockRow;
    countedQty: string;
    note: string;
  } | null>(null);
  const [historyOf, setHistoryOf] = useState<StockRow | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('q', debouncedSearch);
    if (onlyLow) params.set('low', 'true');
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return params.toString();
  }, [debouncedSearch, onlyLow, page]);

  const stock = useQuery({
    queryKey: ['/stock', query],
    queryFn: () => api.get<{ rows: StockRow[]; total: number }>(`/stock?${query}`),
  });

  const alerts = useQuery({
    queryKey: ['/stock/alerts'],
    queryFn: () => api.get<{ rows: StockRow[] }>('/stock/alerts'),
  });

  const history = useQuery({
    queryKey: ['/stock/movements', historyOf?.id],
    queryFn: () =>
      api.get<{ rows: StockMovement[]; total: number }>(
        `/stock/movements?chemicalId=${historyOf!.id}&page=1&pageSize=100`,
      ),
    enabled: Boolean(historyOf),
  });

  useEffect(() => setPage(1), [debouncedSearch, onlyLow]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/stock'] });
    queryClient.invalidateQueries({ queryKey: ['/stock/alerts'] });
    queryClient.invalidateQueries({ queryKey: ['/stock/movements'] });
  };

  const move = useMutation({
    mutationFn: (body: unknown) => api.post('/stock/movements', body),
    onSuccess: () => {
      toast('Stok hareketi kaydedildi.');
      setMoveForm(null);
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const count = useMutation({
    mutationFn: (body: unknown) => api.post('/stock/count', body),
    onSuccess: () => {
      toast('Sayım kaydedildi.');
      setCountForm(null);
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const threshold = useMutation({
    mutationFn: ({ id, minStockQty }: { id: string; minStockQty: number }) =>
      api.put(`/stock/${id}/threshold`, { minStockQty }),
    onSuccess: () => {
      toast('Kritik seviye güncellendi.');
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const res = await api.get<{ rows: StockRow[] }>(
        `/stock?page=1&pageSize=500${debouncedSearch ? `&q=${encodeURIComponent(debouncedSearch)}` : ''}`,
      );
      downloadCsv(stampedFileName('stok-durumu'), res.rows, CSV_COLUMNS);
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }, [debouncedSearch, showError]);

  const canMove = can('STOK', 'create');
  const canEdit = can('STOK', 'edit');

  const columns = useMemo(
    () =>
      tableColumns<StockRow>([
        { Header: 'Kod', accessor: 'code', width: 120 },
        { Header: 'Kimyasal', accessor: 'name', minWidth: 200 },
        {
          Header: 'Eldeki Miktar',
          accessor: 'stockQty',
          width: 150,
          hAlign: 'End' as const,
          Cell: ({ row }: { row: { original: StockRow } }) => (
            <ObjectStatus state={row.original.isLow ? 'Negative' : 'Positive'}>
              {`${formatNumber(row.original.stockQty, 2)} ${row.original.unit}`}
            </ObjectStatus>
          ),
        },
        {
          Header: 'Kritik Seviye',
          accessor: 'minStockQty',
          width: 140,
          hAlign: 'End' as const,
          Cell: ({ row }: { row: { original: StockRow } }) =>
            row.original.minStockQty > 0
              ? `${formatNumber(row.original.minStockQty, 2)} ${row.original.unit}`
              : '-',
        },
        { Header: 'Tedarikçi', accessor: 'supplier', width: 170 },
        {
          ...actionColumn(3),
          Cell: ({ row }: { row: { original: StockRow } }) => (
            <div className="mp-inline-actions">
              {canMove && (
                <Button
                  design="Transparent"
                  icon="add"
                  tooltip="Stok hareketi"
                  onClick={() =>
                    setMoveForm({
                      chemical: row.original,
                      reason: 'GIRIS',
                      quantity: '',
                      note: '',
                    })
                  }
                />
              )}
              {canEdit && (
                <Button
                  design="Transparent"
                  icon="sys-find"
                  tooltip="Sayım"
                  onClick={() =>
                    setCountForm({
                      chemical: row.original,
                      countedQty: String(row.original.stockQty),
                      note: '',
                    })
                  }
                />
              )}
              <Button
                design="Transparent"
                icon="history"
                tooltip="Hareket geçmişi"
                onClick={() => setHistoryOf(row.original)}
              />
            </div>
          ),
        },
      ]),
    [canMove, canEdit],
  );

  const lowRows = alerts.data?.rows ?? [];

  return (
    <div className="mp-page mp-page--wide">
      <PageHeader
        title="Stok Takibi"
        subtitle="Kimyasal stok seviyeleri, hareketler ve kritik seviye uyarıları"
      />

      {lowRows.length > 0 && (
        <MessageStrip design="Negative" hideCloseButton>
          <strong>{lowRows.length} kimyasal kritik seviyede:</strong>{' '}
          {lowRows
            .slice(0, 5)
            .map((c) => `${c.code} (${formatNumber(c.stockQty, 2)} ${c.unit})`)
            .join(', ')}
          {lowRows.length > 5 && ` ve ${lowRows.length - 5} tane daha`}
        </MessageStrip>
      )}

      {stock.isError && (
        <MessageStrip design="Negative" hideCloseButton>
          Stok verileri yüklenemedi. {errorMessage(stock.error)}
        </MessageStrip>
      )}

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          stock.refetch();
          alerts.refetch();
        }}
        count={stock.data?.total}
        onExport={exportCsv}
        exportBusy={exportBusy}
        extra={
          <CheckBox
            text="Yalnızca kritik seviyedekiler"
            checked={onlyLow}
            onChange={(e) => setOnlyLow(e.target.checked)}
          />
        }
      />

      <ListSection>
        <DataTable
          columns={columns}
          data={stock.data?.rows ?? []}
          loading={stock.isLoading}
          filterable
          noDataText={stock.isError ? 'Kayıtlar yüklenemedi.' : 'Kayıtlı kimyasal bulunamadı.'}
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={stock.data?.total ?? 0}
          busy={stock.isFetching}
          onChange={setPage}
        />
      </ListSection>

      {moveForm && (
        <Dialog
          open
          headerText={`Stok Hareketi - ${moveForm.chemical.code}`}
          onClose={() => setMoveForm(null)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button design="Transparent" onClick={() => setMoveForm(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    design="Emphasized"
                    disabled={move.isPending || Number(moveForm.quantity) <= 0}
                    onClick={() =>
                      move.mutate({
                        chemicalId: moveForm.chemical.id,
                        reason: moveForm.reason,
                        quantity: Number(moveForm.quantity),
                        note: moveForm.note.trim() || null,
                      })
                    }
                  >
                    Kaydet
                  </Button>
                </>
              }
            />
          }
        >
          <div style={{ display: 'grid', gap: '0.75rem', minWidth: 'min(420px, 85vw)' }}>
            <MessageStrip design="Information" hideCloseButton>
              Eldeki miktar: <strong>{formatNumber(moveForm.chemical.stockQty, 2)}{' '}
              {moveForm.chemical.unit}</strong>
            </MessageStrip>
            <div>
              <Label showColon>Hareket Tipi</Label>
              <UiSelect
                style={{ width: '100%' }}
                value={moveForm.reason}
                options={(['GIRIS', 'CIKIS', 'IADE', 'URETIM'] as StockReason[]).map((r) => ({
                  value: r,
                  label: `${STOCK_REASON_LABEL[r]} (${INCOMING.includes(r) ? '+' : '−'})`,
                }))}
                onSelect={(v) =>
                  setMoveForm((prev) => (prev ? { ...prev, reason: v as StockReason } : prev))
                }
              />
            </div>
            <div>
              <Label showColon required>
                Miktar ({moveForm.chemical.unit})
              </Label>
              <Input
                type="Number"
                style={{ width: '100%' }}
                value={moveForm.quantity}
                placeholder="Her zaman pozitif girin; yön hareket tipinden belirlenir"
                onInput={(e) =>
                  setMoveForm((prev) => (prev ? { ...prev, quantity: e.target.value } : prev))
                }
              />
            </div>
            <div>
              <Label showColon>Not</Label>
              <Input
                style={{ width: '100%' }}
                value={moveForm.note}
                onInput={(e) =>
                  setMoveForm((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                }
              />
            </div>
          </div>
        </Dialog>
      )}

      {countForm && (
        <Dialog
          open
          headerText={`Sayım - ${countForm.chemical.code}`}
          onClose={() => setCountForm(null)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button design="Transparent" onClick={() => setCountForm(null)}>
                    Vazgeç
                  </Button>
                  <Button
                    design="Emphasized"
                    disabled={count.isPending || countForm.countedQty === ''}
                    onClick={() =>
                      count.mutate({
                        chemicalId: countForm.chemical.id,
                        countedQty: Number(countForm.countedQty),
                        note: countForm.note.trim() || null,
                      })
                    }
                  >
                    Kaydet
                  </Button>
                </>
              }
            />
          }
        >
          <div style={{ display: 'grid', gap: '0.75rem', minWidth: 'min(420px, 85vw)' }}>
            <MessageStrip design="Information" hideCloseButton>
              Sistemdeki miktar:{' '}
              <strong>
                {formatNumber(countForm.chemical.stockQty, 2)} {countForm.chemical.unit}
              </strong>
              . Sayım sonucu farklıysa aradaki fark düzeltme hareketi olarak kaydedilir.
            </MessageStrip>
            <div>
              <Label showColon required>
                Sayılan Miktar ({countForm.chemical.unit})
              </Label>
              <Input
                type="Number"
                style={{ width: '100%' }}
                value={countForm.countedQty}
                onInput={(e) =>
                  setCountForm((prev) => (prev ? { ...prev, countedQty: e.target.value } : prev))
                }
              />
            </div>
            <div>
              <Label showColon>Not</Label>
              <Input
                style={{ width: '100%' }}
                value={countForm.note}
                onInput={(e) =>
                  setCountForm((prev) => (prev ? { ...prev, note: e.target.value } : prev))
                }
              />
            </div>
          </div>
        </Dialog>
      )}

      {historyOf && (
        <Dialog
          open
          stretch
          headerText={`Hareket Geçmişi - ${historyOf.code} ${historyOf.name}`}
          onClose={() => setHistoryOf(null)}
          footer={
            <Bar
              design="Footer"
              startContent={
                canEdit ? (
                  <ThresholdEditor
                    row={historyOf}
                    busy={threshold.isPending}
                    onSave={(minStockQty) => threshold.mutate({ id: historyOf.id, minStockQty })}
                  />
                ) : undefined
              }
              endContent={
                <Button design="Emphasized" onClick={() => setHistoryOf(null)}>
                  Kapat
                </Button>
              }
            />
          }
        >
          <div className="mp-grid-scroll">
            <table className="mp-grid mp-grid--zebra mp-grid--wrap">
              <caption className="mp-visually-hidden">Stok hareket geçmişi</caption>
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Sebep</th>
                  <th scope="col">Değişim</th>
                  <th scope="col">Sonraki Bakiye</th>
                  <th scope="col">Emir</th>
                  <th scope="col">Kullanıcı</th>
                  <th scope="col">Not</th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.rows ?? []).map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.createdAt)}</td>
                    <td>{STOCK_REASON_LABEL[m.reason] ?? m.reason}</td>
                    <td className="mp-grid__num">
                      <ObjectStatus state={m.delta >= 0 ? 'Positive' : 'Negative'}>
                        {`${m.delta > 0 ? '+' : ''}${formatNumber(m.delta, 2)}`}
                      </ObjectStatus>
                    </td>
                    <td className="mp-grid__num">
                      {formatNumber(m.balance, 2)} {m.chemical.unit}
                    </td>
                    <td>{m.order?.orderNo ?? '-'}</td>
                    <td>{m.user?.fullName ?? '-'}</td>
                    <td>{m.note ?? '-'}</td>
                  </tr>
                ))}
                {(history.data?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ color: 'var(--sapContent_LabelColor)' }}>
                      {history.isLoading ? 'Yükleniyor...' : 'Bu kimyasal için hareket kaydı yok.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Dialog>
      )}
    </div>
  );
}

/** Kritik seviye esigini diyalog altbilgisinden duzenler. */
function ThresholdEditor({
  row,
  busy,
  onSave,
}: {
  row: StockRow;
  busy: boolean;
  onSave: (minStockQty: number) => void;
}) {
  const [value, setValue] = useState(String(row.minStockQty));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <Label showColon>Kritik Seviye ({row.unit})</Label>
      <Input
        type="Number"
        style={{ width: '110px' }}
        value={value}
        onInput={(e) => setValue(e.target.value)}
      />
      <Button
        design="Transparent"
        icon="save"
        disabled={busy || value === '' || Number(value) < 0}
        onClick={() => onSave(Number(value))}
      >
        Kaydet
      </Button>
    </div>
  );
}
