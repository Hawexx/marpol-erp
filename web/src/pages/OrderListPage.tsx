import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  Button,
  DatePicker,
  Dialog,
  Input,
  Label,
  MessageBox,
  MessageStrip,
  ObjectStatus,
  Title,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useAuth } from '../auth/AuthContext.js';
import { DataToolbar } from '../components/DataToolbar.js';
import { UiSelect } from '../components/UiSelect.js';
import { Pagination } from '../components/Pagination.js';
import { tableEmptyText } from '../components/states.js';
import { useEntity } from '../api/useEntity.js';
import { useDebounced } from '../lib/useDebounced.js';
import { downloadCsv, stampedFileName, type CsvColumn } from '../lib/csv.js';
import { DataTable } from '../components/DataTable.js';
import { actionColumn, columns as tableColumns } from '../components/table.js';
import { downloadOrderPdf } from '../pdf/orderPdf.js';
import {
  Field,
  FieldGroup,
  KpiTile,
  ListSection,
  NODE_TYPE_LABEL,
  PRIORITY_LABEL,
  PageHeader,
  PriorityBadge,
  STATUS_LABEL,
  STATUS_TONE,
  STEP_LABEL,
  Section,
  StatusBadge,
  daysUntil,
  formatDate,
  formatDateTime,
  formatNumber,
  trToIsoDate,
} from '../components/ui.js';
import type {
  Fabric,
  OrderStatus,
  OrderStepLog,
  OrderSummary,
  ProductionOrder,
  StepStatus,
} from '../api/types.js';

/** Durum bazli izin verilen ilerleme aksiyonlari. */
const ACTIONS: { status: OrderStatus; label: string; icon: string; design?: 'Emphasized' | 'Negative' }[] =
  [
    { status: 'PLANLANDI', label: 'Onayla / Planla', icon: 'accept', design: 'Emphasized' },
    { status: 'URETIMDE', label: 'Üretimi Başlat', icon: 'play', design: 'Emphasized' },
    { status: 'BEKLEMEDE', label: 'Beklemeye Al', icon: 'pause' },
    { status: 'TAMAMLANDI', label: 'Tamamlandı', icon: 'complete', design: 'Emphasized' },
    { status: 'IPTAL', label: 'İptal Et', icon: 'decline', design: 'Negative' },
  ];

/** Sunucuda canApprove yetkisi arayan gecisler (bkz. server/src/routes/orders.ts). */
const APPROVAL_STATUSES: OrderStatus[] = ['PLANLANDI', 'TAMAMLANDI', 'IPTAL'];

const PAGE_SIZE = 50;

/** Disa aktarilan sutunlar. */
const CSV_COLUMNS: CsvColumn<ProductionOrder>[] = [
  { header: 'Emir No', value: (o) => o.orderNo },
  { header: 'Durum', value: (o) => STATUS_LABEL[o.status] },
  { header: 'Aciliyet', value: (o) => PRIORITY_LABEL[o.priority] },
  { header: 'Müşteri', value: (o) => o.customer },
  { header: 'Kumaş', value: (o) => `${o.fabric.code} - ${o.fabric.name}` },
  { header: 'Flanş', value: (o) => `${o.flange.code} - ${o.flange.name}` },
  { header: 'Disk Çapı (mm)', value: (o) => o.diskDiameter },
  { header: 'Adet', value: (o) => o.quantity },
  { header: 'Katman', value: (o) => o.layers },
  { header: 'Üretilen', value: (o) => o.producedQty },
  { header: 'Fire', value: (o) => o.scrapQty },
  { header: 'Termin', value: (o) => formatDate(o.deadline) },
  { header: 'Oluşturan', value: (o) => o.createdBy?.fullName },
  { header: 'Onaylayan', value: (o) => o.approvedBy?.fullName },
  {
    header: 'Kimyasallar',
    value: (o) => o.chemicals.map((c) => `${c.chemical?.code} %${c.ratio}`).join(' + '),
  },
];

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  TASLAK: ['ONAY_BEKLIYOR', 'IPTAL'],
  ONAY_BEKLIYOR: ['PLANLANDI', 'IPTAL'],
  PLANLANDI: ['URETIMDE', 'BEKLEMEDE', 'IPTAL'],
  URETIMDE: ['BEKLEMEDE', 'TAMAMLANDI', 'IPTAL'],
  BEKLEMEDE: ['URETIMDE', 'IPTAL'],
  TAMAMLANDI: [],
  IPTAL: [],
};

/* Rozetlerle ayni haritadan beslenir; iki yerde iki farkli renk olmaz. */
const orderHighlight = (row: Record<string, unknown>) =>
  STATUS_TONE[row.status as OrderStatus] ?? 'None';

export default function OrderListPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const { toast, error: showError } = useNotify();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OPEN' | OrderStatus>('OPEN');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [customerFilter, setCustomerFilter] = useState('');
  const [fabricFilter, setFabricFilter] = useState('');
  const [deadlineFrom, setDeadlineFrom] = useState('');
  const [deadlineTo, setDeadlineTo] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ProductionOrder | null>(null);

  /*
   * Liste satirlari TAM emir kaydi DEGILDIR: yanit boyutunu kucultmek icin
   * sunucu listede `stepLogs` dizisini degil yalnizca sayisini donuyor
   * (bkz. server/src/routes/orders.ts -> listInclude: `_count.stepLogs`).
   * Detay penceresi satiri dogrudan kullandigi icin acilirken
   * "order.stepLogs is not iterable" ile cokuyordu. Pencere acildiginda tam
   * kayit ayrica cekilir; gelene kadar listeden gelen kismi kayit gosterilir.
   */
  const detailQuery = useQuery({
    queryKey: ['/orders', detail?.id],
    queryFn: () => api.get<ProductionOrder>(`/orders/${detail!.id}`),
    enabled: Boolean(detail?.id),
  });
  /** Tam kayit geldiyse onu, gelmediyse listeden gelen kismi satiri verir. */
  const tamKayit = (satir: ProductionOrder): ProductionOrder =>
    detailQuery.data?.id === satir.id ? detailQuery.data : satir;
  const [confirm, setConfirm] = useState<{ order: ProductionOrder; status: OrderStatus } | null>(
    null,
  );
  const [producedQty, setProducedQty] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  // Her tus vurusunda tam sorgu atmamak icin arama gecikmeli uygulanir.
  const debouncedSearch = useDebounced(search, 300);
  const debouncedCustomer = useDebounced(customerFilter, 300);

  const statusParam =
    statusFilter === 'ALL'
      ? ''
      : statusFilter === 'OPEN'
        ? 'TASLAK,ONAY_BEKLIYOR,PLANLANDI,URETIMDE,BEKLEMEDE'
        : statusFilter;

  const fabrics = useEntity<Fabric>('/fabrics', { activeOnly: true });

  /** Filtreleri sorgu dizesine cevirir; disa aktarmada da kullanilir. */
  const buildParams = useCallback(
    (withPaging: boolean) => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('q', debouncedSearch);
      if (statusParam) params.set('status', statusParam);
      if (priorityFilter) params.set('priority', priorityFilter);
      if (debouncedCustomer) params.set('customer', debouncedCustomer);
      if (fabricFilter) params.set('fabricId', fabricFilter);
      // DatePicker dd.MM.yyyy verir; sunucu ISO bekler. Gecersiz tarih
      // filtreye hic eklenmez.
      const fromIso = deadlineFrom ? trToIsoDate(deadlineFrom) : null;
      const toIso = deadlineTo ? trToIsoDate(deadlineTo) : null;
      if (fromIso) params.set('deadlineFrom', fromIso);
      if (toIso) params.set('deadlineTo', toIso);
      if (withPaging) {
        params.set('page', String(page));
        params.set('pageSize', String(PAGE_SIZE));
      }
      return params;
    },
    [
      debouncedSearch,
      statusParam,
      priorityFilter,
      debouncedCustomer,
      fabricFilter,
      deadlineFrom,
      deadlineTo,
      page,
    ],
  );

  const listQuery = buildParams(true).toString();

  const orders = useQuery({
    queryKey: ['/orders', listQuery],
    queryFn: () => api.get<{ rows: ProductionOrder[]; total: number }>(`/orders?${listQuery}`),
  });

  const rows = orders.data?.rows ?? [];
  const total = orders.data?.total ?? 0;

  // Filtre degisince ilk sayfaya don; aksi halde bos sayfada kalinabilir.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [debouncedSearch, statusParam, priorityFilter, debouncedCustomer, fabricFilter, deadlineFrom, deadlineTo]);

  const summary = useQuery({
    queryKey: ['/orders/summary'],
    queryFn: () => api.get<OrderSummary>('/orders/summary'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/orders'] });
    queryClient.invalidateQueries({ queryKey: ['/orders/summary'] });
  };

  const changeStatus = useMutation({
    mutationFn: ({
      id,
      status,
      qty,
    }: {
      id: string;
      status: OrderStatus;
      qty?: number;
    }) =>
      api.patch<ProductionOrder>(`/orders/${id}/status`, {
        status,
        ...(qty !== undefined ? { producedQty: qty } : {}),
      }),
    onSuccess: (order) => {
      toast(`${order.orderNo} → ${STATUS_LABEL[order.status]}`);
      setDetail((prev) => (prev && prev.id === order.id ? order : prev));
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const updateStep = useMutation({
    mutationFn: ({
      orderId,
      nodeId,
      status,
      okQty,
      scrapQty,
      notes,
    }: {
      orderId: string;
      nodeId: string;
      status: StepStatus;
      okQty?: number | null;
      scrapQty?: number | null;
      notes?: string | null;
    }) =>
      api.patch(`/orders/${orderId}/steps/${nodeId}`, {
        status,
        ...(okQty !== undefined ? { okQty } : {}),
        ...(scrapQty !== undefined ? { scrapQty } : {}),
        ...(notes !== undefined ? { notes } : {}),
      }),
    onSuccess: async (_result, variables) => {
      toast('Proses adımı güncellendi.');
      invalidate();
      try {
        const fresh = await api.get<ProductionOrder>(`/orders/${variables.orderId}`);
        // Kullanici bu arada pencereyi kapattiysa yeniden acma; onceki surumde
        // `setDetail(fresh)` kapali diyalogu geri aciyordu.
        setDetail((prev) => (prev && prev.id === variables.orderId ? fresh : prev));
      } catch (err) {
        // onError yalnizca mutationFn hatalarini kapsar; bu istek ayri.
        showError(errorMessage(err));
      }
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const removeOrder = useMutation({
    mutationFn: (id: string) => api.delete(`/orders/${id}`),
    onSuccess: () => {
      toast('Üretim emri silindi.');
      setDeleteTarget(null);
      setDetail(null);
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const [deleteTarget, setDeleteTarget] = useState<ProductionOrder | null>(null);

  /** "Bitir" isleminde miktar girisi icin acilan form. */
  const [stepForm, setStepForm] = useState<{
    orderId: string;
    nodeId: string;
    label: string;
    status: StepStatus;
    okQty: string;
    scrapQty: string;
    notes: string;
    maxQty: number;
  } | null>(null);

  const bulkStatus = useMutation({
    mutationFn: ({ ids, status }: { ids: string[]; status: OrderStatus }) =>
      api.patch<{ updated: number; skipped: { orderNo: string; reason: string }[] }>(
        '/orders/bulk-status',
        { ids, status },
      ),
    onSuccess: (result) => {
      // Atlanan kayitlari sessizce yutmak, kullanicinin isini yapildi
      // sanmasina yol acar; sebebiyle birlikte gosterilir.
      if (result.skipped.length) {
        showError(
          `${result.updated} emir güncellendi. Atlananlar: ` +
            result.skipped.map((s) => `${s.orderNo} (${s.reason})`).join(', '),
        );
      } else {
        toast(`${result.updated} emir güncellendi.`);
      }
      setSelected(new Set());
      setBulkTarget(null);
      invalidate();
    },
    onError: (err) => showError(errorMessage(err)),
  });

  const [bulkTarget, setBulkTarget] = useState<OrderStatus | null>(null);

  /**
   * Disa aktarma sayfayla sinirli olmamali: mevcut filtrelerin TAMAMINI
   * sunucudan cekip oyle yazar.
   */
  const exportCsv = useCallback(async () => {
    setExportBusy(true);
    try {
      const params = buildParams(false);
      params.set('page', '1');
      params.set('pageSize', '500');

      const all: ProductionOrder[] = [];
      for (let p = 1; ; p++) {
        params.set('page', String(p));
        const res = await api.get<{ rows: ProductionOrder[]; total: number }>(`/orders?${params}`);
        all.push(...res.rows);
        if (all.length >= res.total || res.rows.length === 0) break;
      }

      downloadCsv(stampedFileName('uretim-emirleri'), all, CSV_COLUMNS);
      toast(`${all.length} emir dışa aktarıldı.`);
    } catch (err) {
      showError(errorMessage(err));
    } finally {
      setExportBusy(false);
    }
  }, [buildParams, toast, showError]);

  const [pdfBusy, setPdfBusy] = useState<string | null>(null);

  /** Emri PDF olarak indirir; guncel veriyi sunucudan cekip basar. */
  const downloadPdf = useCallback(
    async (order: ProductionOrder) => {
      setPdfBusy(order.id);
      try {
        // Liste yaniti tum ayrintilari icerse de, baski aninda en guncel hali alinir.
        const fresh = await api.get<ProductionOrder>(`/orders/${order.id}`);
        await downloadOrderPdf(fresh);
        toast(`${fresh.orderNo} PDF olarak indirildi.`);
      } catch (err) {
        showError(errorMessage(err));
      } finally {
        setPdfBusy(null);
      }
    },
    [toast, showError],
  );

  /* Native secim, satirlari `getRowId` ile gercek emir kimligine bagladigimiz
     icin dogrudan id -> boolean haritasi olarak gelir. */
  const selectedRowIds = useMemo(
    () => Object.fromEntries([...selected].map((id) => [id, true])),
    [selected],
  );

  const columns = useMemo(
    () => tableColumns<ProductionOrder>([
      { Header: 'Emir No', accessor: 'orderNo', width: 150 },
      {
        Header: 'Durum',
        accessor: 'status',
        width: 140,
        Cell: ({ value }: { value: OrderStatus }) => <StatusBadge status={value} />,
      },
      {
        Header: 'Aciliyet',
        accessor: 'priority',
        width: 110,
        Cell: ({ row }: { row: { original: ProductionOrder } }) => (
          <PriorityBadge priority={row.original.priority} />
        ),
      },
      { Header: 'Müşteri', accessor: 'customer', width: 180 },
      {
        Header: 'Kumaş',
        id: 'fabric',
        width: 200,
        Cell: ({ row }: { row: { original: ProductionOrder } }) =>
          `${row.original.fabric.code} - ${row.original.fabric.name}`,
      },
      {
        Header: 'Flanş',
        id: 'flange',
        width: 200,
        Cell: ({ row }: { row: { original: ProductionOrder } }) =>
          `${row.original.flange.code} - ${row.original.flange.name}`,
      },
      {
        Header: 'Disk Çapı',
        accessor: 'diskDiameter',
        width: 110,
        hAlign: 'End' as const,
        Cell: ({ value }: { value: number }) => `${formatNumber(value, 1)} mm`,
      },
      {
        Header: 'Adet',
        accessor: 'quantity',
        width: 100,
        hAlign: 'End' as const,
        Cell: ({ value }: { value: number }) => formatNumber(value),
      },
      { Header: 'Katman', accessor: 'layers', width: 90, hAlign: 'End' as const },
      {
        Header: 'Termin',
        accessor: 'deadline',
        width: 120,
        Cell: ({ value }: { value: string }) => formatDate(value),
      },
      {
        Header: 'Kalan Gün',
        id: 'remaining',
        width: 120,
        disableFilters: true,
        Cell: ({ row }: { row: { original: ProductionOrder } }) => {
          const order = row.original;
          if (order.status === 'TAMAMLANDI' || order.status === 'IPTAL') return '-';
          const days = daysUntil(order.deadline);
          return (
            <ObjectStatus state={days < 0 ? 'Negative' : days <= 3 ? 'Critical' : 'Positive'}>
              {days < 0 ? `${Math.abs(days)} gün gecikme` : `${days} gün`}
            </ObjectStatus>
          );
        },
      },
      {
        ...actionColumn(1, { Header: 'Detay' }),
        Cell: ({ row }: { row: { original: ProductionOrder } }) => (
          <Button
            design="Transparent"
            icon="detail-view"
            tooltip="Detay"
            onClick={() => setDetail(row.original)}
          />
        ),
      },
    ]),
    [],
  );

  const s = summary.data;

  return (
    <div className="mp-page mp-page--wide">
      <PageHeader
        title="Üretim Emirleri"
        subtitle="Üretim hattına düşen emirler, durumları ve proses ilerlemeleri"
      />

      <div className="mp-kpis">
        <KpiTile label="Toplam Emir" value={formatNumber(s?.total ?? 0)} tone="info" />
        <KpiTile
          label="Onay Bekleyen"
          value={formatNumber(s?.byStatus.ONAY_BEKLIYOR ?? 0)}
          tone="warning"
        />
        <KpiTile label="Üretimde" value={formatNumber(s?.byStatus.URETIMDE ?? 0)} tone="info" />
        <KpiTile
          label="Tamamlanan"
          value={formatNumber(s?.byStatus.TAMAMLANDI ?? 0)}
          tone="good"
        />
        <KpiTile label="Termini Geçen" value={formatNumber(s?.overdue ?? 0)} tone="critical" />
        <KpiTile label="Kritik Aciliyet" value={formatNumber(s?.byPriority.KRITIK ?? 0)} tone="critical" />
      </div>

      <DataToolbar
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          orders.refetch();
          summary.refetch();
        }}
        count={total}
        onExport={exportCsv}
        exportBusy={exportBusy}
        filters={
          <>
            <Label showColon>Durum</Label>
            <UiSelect
              style={{ minWidth: '190px' }}
              value={statusFilter}
              options={[
                { value: 'OPEN', label: 'Açık Emirler' },
                { value: 'ALL', label: 'Tümü' },
                ...(Object.keys(STATUS_LABEL) as OrderStatus[]).map((status) => ({
                  value: status,
                  label: STATUS_LABEL[status],
                })),
              ]}
              onSelect={(v) => setStatusFilter(v as typeof statusFilter)}
            />
            <Button
              design="Transparent"
              icon="filter"
              onClick={() => setFiltersOpen((v) => !v)}
            >
              {filtersOpen ? 'Filtreleri Gizle' : 'Diğer Filtreler'}
            </Button>
          </>
        }
      />

      {filtersOpen && (
        <Section>
          <div className="mp-filters">
            <div className="mp-filters__item">
              <Label showColon>Aciliyet</Label>
              <UiSelect
                style={{ width: '100%' }}
                value={priorityFilter}
                placeholder="(tümü)"
                options={(Object.keys(PRIORITY_LABEL) as (keyof typeof PRIORITY_LABEL)[]).map(
                  (p) => ({ value: p as string, label: PRIORITY_LABEL[p] }),
                )}
                onSelect={setPriorityFilter}
              />
            </div>
            <div className="mp-filters__item">
              <Label showColon>Müşteri</Label>
              <Input
                style={{ width: '100%' }}
                placeholder="Müşteri adı"
                value={customerFilter}
                onInput={(e) => setCustomerFilter(e.target.value)}
              />
            </div>
            <div className="mp-filters__item mp-filters__item--wide">
              <Label showColon>Kumaş</Label>
              <UiSelect
                style={{ width: '100%' }}
                value={fabricFilter}
                placeholder="(tümü)"
                options={(fabrics.list.data ?? []).map((f) => ({
                  value: f.id,
                  label: `${f.code} - ${f.name}`,
                }))}
                onSelect={setFabricFilter}
              />
            </div>
            <div className="mp-filters__item">
              <Label showColon>Termin (baş.)</Label>
              <DatePicker
                style={{ width: '100%' }}
                formatPattern="dd.MM.yyyy"
                value={deadlineFrom}
                valueState={deadlineFrom && !trToIsoDate(deadlineFrom) ? 'Negative' : 'None'}
                onChange={(e) => setDeadlineFrom(e.target.value ?? '')}
              />
            </div>
            <div className="mp-filters__item">
              <Label showColon>Termin (bit.)</Label>
              <DatePicker
                style={{ width: '100%' }}
                formatPattern="dd.MM.yyyy"
                value={deadlineTo}
                valueState={deadlineTo && !trToIsoDate(deadlineTo) ? 'Negative' : 'None'}
                onChange={(e) => setDeadlineTo(e.target.value ?? '')}
              />
            </div>
            <Button
              design="Transparent"
              icon="clear-filter"
              onClick={() => {
                setPriorityFilter('');
                setCustomerFilter('');
                setFabricFilter('');
                setDeadlineFrom('');
                setDeadlineTo('');
              }}
            >
              Temizle
            </Button>
          </div>
        </Section>
      )}

      {selected.size > 0 && can('URETIM_EMIRLERI', 'edit') && (
        <MessageStrip design="Information" hideCloseButton>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <span>{selected.size} emir seçildi.</span>
            {can('URETIM_EMIRLERI', 'approve') && (
              <>
                <Button
                  design="Emphasized"
                  icon="accept"
                  disabled={bulkStatus.isPending}
                  onClick={() => setBulkTarget('PLANLANDI')}
                >
                  Toplu Onayla
                </Button>
                <Button
                  design="Negative"
                  icon="decline"
                  disabled={bulkStatus.isPending}
                  onClick={() => setBulkTarget('IPTAL')}
                >
                  Toplu İptal
                </Button>
              </>
            )}
            <Button design="Transparent" onClick={() => setSelected(new Set())}>
              Seçimi Temizle
            </Button>
          </div>
        </MessageStrip>
      )}

      {orders.isError && (
        <MessageStrip design="Negative" hideCloseButton style={{ marginBottom: '0.5rem' }}>
          Üretim emirleri yüklenemedi. {errorMessage(orders.error)}{' '}
          <Button design="Transparent" onClick={() => orders.refetch()}>
            Tekrar Dene
          </Button>
        </MessageStrip>
      )}

      <ListSection>
        <DataTable
          columns={columns}
          data={rows}
          loading={orders.isLoading}
          filterable
          /* RowSelector: secim YALNIZCA onay kutusu sutunundan yapilir, boylece
             satira tiklamak detay penceresini acmaya devam eder. */
          /* Satir basinda durum rengi seridi. `highlightField` fonksiyon olarak
             verildiginde MEMOIZE edilmis olmali - modul kapsaminda sabit. */
          withRowHighlight
          highlightField={orderHighlight}
          /* Secim sutunu tablo BOSKEN acilmaz. UI5 bu sutunun genisligini
             tablonun DOM dugumunden okuyor (getSelectionColumnWidth); ilk
             render'da o dugum henuz yok, genislik `undefined` donuyor ve
             yukleme iskeleti `width: NaN` ile ciziliyor (React gelistirme
             derlemesinde uyari veriyor). Bos tabloda zaten secilecek satir
             yok; veri gelince sutun dogru genislikle aciliyor. */
          selectionMode={rows.length > 0 ? 'Multiple' : 'None'}
          selectionBehavior="RowSelector"
          selectedRowIds={selectedRowIds}
          /* Varsayilanda react-table satir kimligi olarak dizi indisini kullanir;
             sayfa degisince veya siralama yapilinca secim yanlis satirlara
             kayar. Gercek emir kimligine baglaniyor. */
          reactTableOptions={{
            getRowId: (row: ProductionOrder) => row.id,
          }}
          onRowSelect={(e) => {
            const ids = e.detail.selectedRowIds ?? {};
            setSelected(new Set(Object.keys(ids).filter((id) => ids[id])));
          }}
          noDataText={tableEmptyText({
            isError: orders.isError,
            filtered: Boolean(
              debouncedSearch ||
                priorityFilter ||
                customerFilter ||
                fabricFilter ||
                deadlineFrom ||
                deadlineTo ||
                statusFilter !== 'OPEN',
            ),
            empty: 'Henüz üretim emri oluşturulmamış.',
            noResults: 'Bu filtrelerle görüntülenecek üretim emri bulunamadı.',
          })}
          onRowClick={(e) => {
            const row = e.detail.row?.original as ProductionOrder | undefined;
            if (row) setDetail(row);
          }}
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          busy={orders.isFetching}
          onChange={(next) => {
            // Secim gorunen sayfayla sinirli: gorunmeyen satirlar toplu
            // isleme dahil olup kazaya yol acmasin.
            setSelected(new Set());
            setPage(next);
          }}
        />
      </ListSection>

      {detail && (
        <Dialog
          open
          stretch
          headerText={`Üretim Emri - ${detail.orderNo}`}
          onClose={() => setDetail(null)}
          footer={
            <Bar
              design="Footer"
              startContent={<StatusBadge status={detail.status} />}
              endContent={
                <>
                  {/*
                    Altbilgide eskiden ayni anda alti buton ve birden fazla
                    Emphasized/Negative bulunabiliyordu; hangisinin asil eylem
                    oldugu belli olmuyordu. Artik TEK bir birincil eylem
                    (durumun sonraki adimi) one cikiyor, geri kalani tasma
                    menusune iniyor.
                  */}
                  {(() => {
                    const izinli = can('URETIM_EMIRLERI', 'edit')
                      ? ACTIONS.filter(
                          (action) =>
                            ALLOWED[detail.status].includes(action.status) &&
                            // Onay/tamamlama/iptal ayri bir yetki: sunucu da bunu
                            // uyguladigi icin butonu gostermek 403 ile sonuclanirdi.
                            (!APPROVAL_STATUSES.includes(action.status) ||
                              can('URETIM_EMIRLERI', 'approve')),
                        )
                      : [];
                    // Birincil = ilerleten ilk eylem; iptal asla birincil olmaz.
                    const birincil = izinli.find((a) => a.design === 'Emphasized');
                    const digerleri = izinli.filter((a) => a !== birincil);

                    const basla = (status: OrderStatus) => {
                      setProducedQty(String(detail.quantity));
                      setConfirm({ order: detail, status });
                    };

                    return (
                      <>
                        {digerleri.length > 0 && (
                          <>
                            {digerleri.map((action) => (
                              <Button
                                key={action.status}
                                design="Transparent"
                                icon={action.icon}
                                disabled={changeStatus.isPending}
                                onClick={() => basla(action.status)}
                              >
                                {action.label}
                              </Button>
                            ))}
                          </>
                        )}
                        <Button
                          design="Transparent"
                          icon="pdf-attachment"
                          tooltip="PDF İndir"
                          disabled={pdfBusy === detail.id}
                          onClick={() => downloadPdf(detail)}
                        >
                          {pdfBusy === detail.id ? 'Hazırlanıyor...' : 'PDF'}
                        </Button>
                        {/*
                          PUT /orders/:id ve DELETE /orders/:id sunucuda vardi ama
                          arayuzden hic cagrilmiyordu: emirler yazildiktan sonra
                          duzenlenemiyordu.
                        */}
                        {can('URETIM_EMRI_OLUSTUR', 'edit') &&
                          detail.status !== 'TAMAMLANDI' &&
                          detail.status !== 'IPTAL' && (
                            <Button
                              design="Transparent"
                              icon="edit"
                              tooltip="Düzenle"
                              onClick={() => navigate(`/uretim-emri-duzenle/${detail.id}`)}
                            />
                          )}
                        {can('URETIM_EMRI_OLUSTUR', 'delete') &&
                          (detail.status === 'TASLAK' || detail.status === 'IPTAL') && (
                            <Button
                              design="Transparent"
                              icon="delete"
                              tooltip="Sil"
                              disabled={removeOrder.isPending}
                              onClick={() => setDeleteTarget(detail)}
                            />
                          )}
                        {/* Tek Emphasized, en sagda. */}
                        {birincil && (
                          <Button
                            design="Emphasized"
                            icon={birincil.icon}
                            disabled={changeStatus.isPending}
                            onClick={() => basla(birincil.status)}
                          >
                            {birincil.label}
                          </Button>
                        )}
                      </>
                    );
                  })()}
                  <Button design="Transparent" onClick={() => setDetail(null)}>
                    Kapat
                  </Button>
                </>
              }
            />
          }
        >
          <OrderDetail
            order={tamKayit(detail)}
            canEdit={can('URETIM_EMIRLERI', 'edit')}
            onStep={(step, status) => {
              // Bitirme miktar girisi ister; diger gecisler dogrudan uygulanir.
              if (status === 'TAMAMLANDI') {
                const kalan =
                  tamKayit(detail).quantity -
                  (tamKayit(detail).stepLogs ?? []).reduce(
                    (sum, s) => (s.nodeId === step.nodeId ? sum : sum + (s.scrapQty ?? 0)),
                    0,
                  );
                setStepForm({
                  orderId: detail.id,
                  nodeId: step.nodeId,
                  label: step.node.label,
                  status,
                  okQty: String(step.okQty ?? kalan),
                  scrapQty: String(step.scrapQty ?? 0),
                  notes: step.notes ?? '',
                  maxQty: detail.quantity,
                });
                return;
              }
              updateStep.mutate({ orderId: detail.id, nodeId: step.nodeId, status });
            }}
          />
        </Dialog>
      )}

      {bulkTarget && (
        <MessageBox
          open
          type="Confirm"
          titleText={bulkTarget === 'IPTAL' ? 'Toplu İptal' : 'Toplu Onay'}
          actions={['Uygula', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Uygula') {
              bulkStatus.mutate({ ids: [...selected], status: bulkTarget });
            } else {
              setBulkTarget(null);
            }
          }}
        >
          Seçili <strong>{selected.size}</strong> emir{' '}
          <strong>{STATUS_LABEL[bulkTarget]}</strong> durumuna alınacak. Geçişe uygun olmayan
          emirler atlanır ve sebebiyle birlikte bildirilir.
        </MessageBox>
      )}

      {deleteTarget && (
        <MessageBox
          open
          type="Warning"
          titleText="Üretim Emrini Sil"
          actions={['Sil', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Sil') removeOrder.mutate(deleteTarget.id);
            else setDeleteTarget(null);
          }}
        >
          <strong>{deleteTarget.orderNo}</strong> numaralı üretim emrini silmek istediğinize emin
          misiniz? Bu işlem geri alınamaz.
        </MessageBox>
      )}

      {stepForm && (
        <StepFinishDialog
          form={stepForm}
          busy={updateStep.isPending}
          onChange={(patch) => setStepForm((prev) => (prev ? { ...prev, ...patch } : prev))}
          onCancel={() => setStepForm(null)}
          onSubmit={() => {
            updateStep.mutate(
              {
                orderId: stepForm.orderId,
                nodeId: stepForm.nodeId,
                status: stepForm.status,
                okQty: stepForm.okQty === '' ? null : Number(stepForm.okQty),
                scrapQty: stepForm.scrapQty === '' ? null : Number(stepForm.scrapQty),
                notes: stepForm.notes.trim() || null,
              },
              { onSuccess: () => setStepForm(null) },
            );
          }}
        />
      )}

      {confirm && (
        <MessageBox
          open
          type="Confirm"
          titleText="Durum Değişikliği"
          actions={['Onayla', 'Vazgeç']}
          onClose={(action) => {
            if (action === 'Onayla') {
              changeStatus.mutate({
                id: confirm.order.id,
                status: confirm.status,
                ...(confirm.status === 'TAMAMLANDI' ? { qty: Number(producedQty) || 0 } : {}),
              });
            }
            setConfirm(null);
          }}
        >
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <span>
              <strong>{confirm.order.orderNo}</strong> numaralı emrin durumu{' '}
              <strong>{STATUS_LABEL[confirm.status]}</strong> olarak değiştirilecek. Onaylıyor
              musunuz?
            </span>
            {confirm.status === 'TAMAMLANDI' && (
              <div>
                <Label showColon>Üretilen Adet</Label>
                <Input
                  type="Number"
                  style={{ width: '100%' }}
                  value={producedQty}
                  onInput={(e) => setProducedQty(e.target.value)}
                />
              </div>
            )}
          </div>
        </MessageBox>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMIR DETAYI
// ---------------------------------------------------------------------------

function OrderDetail({
  order,
  canEdit,
  onStep,
}: {
  order: ProductionOrder;
  canEdit: boolean;
  onStep: (step: OrderStepLog, status: StepStatus) => void;
}) {
  const remaining = daysUntil(order.deadline);
  const overdue =
    remaining < 0 && order.status !== 'TAMAMLANDI' && order.status !== 'IPTAL';

  /*
   * `stepLogs` OLMAYABILIR: liste ucu yanit boyutu icin yalnizca adim SAYISINI
   * donuyor. Tam kayit gelene kadar (ve ileride baska bir kismi kayit
   * gelirse) burasi cokmemeli.
   */
  const steps = [...(order.stepLogs ?? [])].sort(
    (a, b) => a.node.sortOrder - b.node.sortOrder,
  );
  const adimlarYuklendi = Array.isArray(order.stepLogs);

  // stepLogs'ta zaten duruyordu ama hicbir yerde gosterilmiyordu.
  const toplamFire = steps.reduce((sum, st) => sum + (st.scrapQty ?? 0), 0);

  return (
    <div className="mp-detail">
      {/* Kimlik blogu: 18 mikro alanin duvari yerine once "bu hangi emir". */}
      <header className="mp-detail__identity">
        <div>
          <div className="mp-overline">Üretim Emri</div>
          <div className="mp-detail__no">{order.orderNo}</div>
        </div>
        <div className="mp-detail__badges">
          <StatusBadge status={order.status} />
          <PriorityBadge priority={order.priority} />
        </div>
      </header>

      {overdue && (
        <MessageStrip design="Negative" hideCloseButton>
          Bu emir termin tarihini {Math.abs(remaining)} gün aşmış durumda.
        </MessageStrip>
      )}

      {/* Ozet en altta duruyordu; artik ilk ekranda ve one cikarilmis. */}
      <section className="mp-callout">
        <div className="mp-overline">Ürün Özeti</div>
        <p className="mp-detail__summary">
          <strong>{formatNumber(order.quantity)} adet</strong>{' '}
          <strong>{formatNumber(order.diskDiameter, 0)} mm</strong> çapında,{' '}
          <strong>{order.layers} katman</strong> disk cila fırçası;{' '}
          <strong>{order.fabric.name}</strong> kumaşı{' '}
          <strong>{order.flange.name}</strong> flanşı ile,{' '}
          {order.chemicals.map((c) => `${c.chemical?.code} %${c.ratio}`).join(' + ')} oranındaki
          kimyasal karışımı emdirilerek üretilecektir. Aciliyet:{' '}
          <strong>{PRIORITY_LABEL[order.priority]}</strong>, termin:{' '}
          <strong>{formatDate(order.deadline)}</strong>.
        </p>
      </section>

      {/*
        auto-fit izgarasi artik 18 alana degil DORT GRUBA uygulaniyor;
        alanlar kendi grubunun icinde kaliyor ve ilgisiz alanlar yan yana
        dizilmiyor.
      */}
      <div className="mp-detail__groups">
        <section>
          <div className="mp-overline">Ürün</div>
          <FieldGroup>
            <Field label="Kumaş Çeşidi" value={`${order.fabric.code} - ${order.fabric.name}`} />
            <Field label="Flanş Çeşidi" value={`${order.flange.code} - ${order.flange.name}`} />
            <Field label="Disk Çapı" value={`${formatNumber(order.diskDiameter, 1)} mm`} />
            <Field label="Katman Sayısı" value={order.layers} />
          </FieldGroup>
        </section>

        <section>
          <div className="mp-overline">Miktar</div>
          <FieldGroup>
            <Field label="Üretim Adedi" value={formatNumber(order.quantity)} />
            <Field label="Üretilen Adet" value={formatNumber(order.producedQty)} />
            <Field label="Toplam Fire" value={formatNumber(toplamFire)} />
            <Field label="Müşteri" value={order.customer || '-'} />
          </FieldGroup>
        </section>

        <section>
          <div className="mp-overline">Zaman Çizelgesi</div>
          <FieldGroup>
            <Field label="Termin Tarihi" value={formatDate(order.deadline)} />
            <Field
              label="Kalan Süre"
              value={
                order.status === 'TAMAMLANDI' || order.status === 'IPTAL'
                  ? '-'
                  : remaining < 0
                    ? `${Math.abs(remaining)} gün gecikme`
                    : `${remaining} gün`
              }
            />
            <Field label="Planlanan Başlangıç" value={formatDate(order.plannedStart)} />
            <Field label="Üretim Başlangıcı" value={formatDateTime(order.startedAt)} />
            <Field label="Tamamlanma" value={formatDateTime(order.completedAt)} />
          </FieldGroup>
        </section>

        <section>
          <div className="mp-overline">Kayıt</div>
          <FieldGroup>
            <Field label="Emri Oluşturan" value={order.createdBy.fullName} />
            <Field label="Onaylayan" value={order.approvedBy?.fullName ?? '-'} />
            <Field label="Oluşturma" value={formatDateTime(order.createdAt)} />
          </FieldGroup>
        </section>
      </div>

      {order.notes && (
        <section>
          <div className="mp-overline">Üretim Notları</div>
          <p className="mp-detail__summary">{order.notes}</p>
        </section>
      )}

      <section>
        <Title level="H2" size="H5">
          Kimyasal Oranlaması
          {order.recipe ? ` (Reçete: ${order.recipe.code} - ${order.recipe.name})` : ''}
        </Title>
        <div className="mp-grid-scroll" style={{ marginTop: '0.5rem' }}>
        <table className="mp-grid mp-grid--zebra mp-grid--wrap">
          <thead>
            <tr>
              <th scope="col" style={{ width: '18%' }}>Kimyasal Kodu</th>
              <th scope="col" style={{ width: '42%' }}>Kimyasal Adı</th>
              <th scope="col" style={{ width: '15%' }}>Oran (%)</th>
              <th scope="col" style={{ width: '25%' }}>Not</th>
            </tr>
          </thead>
          <tbody>
            {order.chemicals.map((row) => (
              <tr key={row.chemicalId}>
                <td>{row.chemical?.code ?? '-'}</td>
                <td>{row.chemical?.name ?? '-'}</td>
                <td>%{formatNumber(row.ratio, 2)}</td>
                <td>{row.notes ?? '-'}</td>
              </tr>
            ))}
            {order.chemicals.length === 0 && (
              <tr>
                <td colSpan={4}>Kimyasal oranlaması girilmemiş.</td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </section>

      <section>
        <Title level="H2" size="H5">
          Üretim Proses Akışı
          {order.workflow ? ` (${order.workflow.code} - ${order.workflow.name})` : ''}
        </Title>
        {!adimlarYuklendi ? (
          <div style={{ marginTop: '0.5rem', color: 'var(--sapContent_LabelColor)' }}>
            Adımlar yükleniyor...
          </div>
        ) : steps.length === 0 ? (
          <div style={{ marginTop: '0.5rem', color: 'var(--sapContent_LabelColor)' }}>
            Bu emre bir proses şeması bağlanmamış.
          </div>
        ) : (
          <div className="mp-grid-scroll" style={{ marginTop: '0.5rem' }}>
          <table className="mp-grid mp-grid--zebra mp-grid--wrap">
            <thead>
              <tr>
                <th scope="col" style={{ width: '4%' }}>#</th>
                <th scope="col" style={{ width: '22%' }}>Adım</th>
                <th scope="col" style={{ width: '10%' }}>Tip</th>
                <th scope="col" style={{ width: '14%' }}>Makine</th>
                <th scope="col" style={{ width: '10%' }}>Durum</th>
                <th scope="col" style={{ width: '7%' }}>Sağlam</th>
                <th scope="col" style={{ width: '7%' }}>Fire</th>
                <th scope="col" style={{ width: '10%' }}>Operatör</th>
                <th scope="col" style={{ width: '16%' }}>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.id}>
                  <td>{index + 1}</td>
                  <td>{step.node.label}</td>
                  <td>{NODE_TYPE_LABEL[step.node.type]}</td>
                  <td>{step.node.machine?.name ?? '-'}</td>
                  <td>
                    <ObjectStatus
                      state={
                        step.status === 'TAMAMLANDI'
                          ? 'Positive'
                          : step.status === 'BASLADI'
                            ? 'Information'
                            : step.status === 'ATLANDI'
                              ? 'Critical'
                              : 'None'
                      }
                    >
                      {STEP_LABEL[step.status]}
                    </ObjectStatus>
                  </td>
                  <td className="mp-grid__num">
                    {step.okQty === null || step.okQty === undefined
                      ? '-'
                      : formatNumber(step.okQty)}
                  </td>
                  <td className="mp-grid__num">
                    {step.scrapQty === null || step.scrapQty === undefined
                      ? '-'
                      : formatNumber(step.scrapQty)}
                  </td>
                  <td>{step.operator?.fullName ?? '-'}</td>
                  <td>
                    <div className="mp-inline-actions">
                      {canEdit && step.status === 'BEKLIYOR' && (
                        <>
                          <Button
                            design="Transparent"
                            icon="play"
                            onClick={() => onStep(step, 'BASLADI')}
                          >
                            Başlat
                          </Button>
                          <Button
                            design="Transparent"
                            icon="forward"
                            tooltip="Bu adım uygulanmayacak"
                            onClick={() => onStep(step, 'ATLANDI')}
                          >
                            Atla
                          </Button>
                        </>
                      )}
                      {canEdit && step.status === 'BASLADI' && (
                        <>
                          <Button
                            design="Transparent"
                            icon="accept"
                            onClick={() => onStep(step, 'TAMAMLANDI')}
                          >
                            Bitir
                          </Button>
                          <Button
                            design="Transparent"
                            icon="forward"
                            onClick={() => onStep(step, 'ATLANDI')}
                          >
                            Atla
                          </Button>
                        </>
                      )}
                      {canEdit && step.status === 'TAMAMLANDI' && (
                        <Button
                          design="Transparent"
                          icon="edit"
                          tooltip="Hatalı giriş için adımı yeniden aç"
                          onClick={() => onStep(step, 'BASLADI')}
                        >
                          Düzelt
                        </Button>
                      )}
                      {canEdit && step.status === 'ATLANDI' && (
                        <Button
                          design="Transparent"
                          icon="undo"
                          onClick={() => onStep(step, 'BEKLIYOR')}
                        >
                          Geri Al
                        </Button>
                      )}
                      {!canEdit && step.status === 'TAMAMLANDI' && formatDateTime(step.completedAt)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>

    </div>
  );
}

interface StepFormState {
  orderId: string;
  nodeId: string;
  label: string;
  status: StepStatus;
  okQty: string;
  scrapQty: string;
  notes: string;
  maxQty: number;
}

/**
 * Adim bitirilirken saglam/fire miktari ve not alir.
 *
 * Bu alanlar veritabaninda ve sunucu semasinda bastan beri vardi ama arayuz
 * yalnizca `{ status }` gonderdigi icin saha verisi hic toplanamiyordu.
 */
function StepFinishDialog({
  form,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  form: StepFormState;
  busy: boolean;
  onChange: (patch: Partial<StepFormState>) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const ok = form.okQty === '' ? 0 : Number(form.okQty);
  const scrap = form.scrapQty === '' ? 0 : Number(form.scrapQty);
  const toplam = ok + scrap;
  const asim = toplam > form.maxQty;
  const gecersiz = Number.isNaN(ok) || Number.isNaN(scrap) || ok < 0 || scrap < 0;

  return (
    <Dialog
      open
      headerText={`Adımı Bitir - ${form.label}`}
      onClose={onCancel}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button design="Transparent" onClick={onCancel}>
                Vazgeç
              </Button>
              <Button design="Emphasized" disabled={busy || asim || gecersiz} onClick={onSubmit}>
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', minWidth: 'min(420px, 85vw)' }}>
        {asim && (
          <MessageStrip design="Negative" hideCloseButton>
            Sağlam + fire toplamı ({formatNumber(toplam)}) emir adedini ({formatNumber(form.maxQty)})
            aşamaz.
          </MessageStrip>
        )}
        <div>
          <Label showColon>Sağlam Adet</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={form.okQty}
            valueState={gecersiz || asim ? 'Negative' : 'None'}
            onInput={(e) => onChange({ okQty: e.target.value })}
          />
        </div>
        <div>
          <Label showColon>Fire Adet</Label>
          <Input
            type="Number"
            style={{ width: '100%' }}
            value={form.scrapQty}
            valueState={gecersiz || asim ? 'Negative' : 'None'}
            onInput={(e) => onChange({ scrapQty: e.target.value })}
          />
        </div>
        <div>
          <Label showColon>Not</Label>
          <Input
            style={{ width: '100%' }}
            placeholder="İsteğe bağlı"
            value={form.notes}
            onInput={(e) => onChange({ notes: e.target.value })}
          />
        </div>
      </div>
    </Dialog>
  );
}
