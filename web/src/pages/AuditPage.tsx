import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AnalyticalTable,
  Bar,
  Button,
  Dialog,
  Input,
  Label,
  ObjectStatus,
  Text,
} from '@ui5/webcomponents-react';
import { api } from '../api/client.js';
import { UiSelect } from '../components/UiSelect.js';
import { columns as tableColumns } from '../components/table.js';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  PageHeader,
  formatDateTime,
  trToIsoDate,
} from '../components/ui.js';
import type { AuditFilters, AuditLog, AuditPage as AuditPageData } from '../api/types.js';

const PAGE_SIZE = 50;

/** Basarisiz giris ve silme gibi dikkat cekmesi gereken eylemler vurgulanir. */
const ACTION_TONE: Record<string, 'None' | 'Positive' | 'Critical' | 'Negative' | 'Information'> = {
  CREATE: 'Positive',
  UPDATE: 'Information',
  DELETE: 'Negative',
  DEACTIVATE: 'Critical',
  LOGIN: 'None',
  LOGOUT: 'None',
  LOGIN_FAILED: 'Negative',
  LOGIN_LOCKED: 'Negative',
  LOGIN_INACTIVE: 'Critical',
  CHANGE_PASSWORD: 'Critical',
  STATUS_CHANGE: 'Information',
  STEP_UPDATE: 'None',
};


export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const fromIso = from ? trToIsoDate(from) : null;
  const toIso = to ? trToIsoDate(to) : null;

  const filters = useQuery({
    queryKey: ['/audit/filters'],
    queryFn: () => api.get<AuditFilters>('/audit/filters'),
  });

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (action) params.set('action', action);
    if (entity) params.set('entity', entity);
    if (userId) params.set('userId', userId);
    if (fromIso) params.set('from', fromIso);
    if (toIso) params.set('to', toIso);
    params.set('page', String(page));
    params.set('pageSize', String(PAGE_SIZE));
    return params.toString();
  }, [search, action, entity, userId, fromIso, toIso, page]);

  const logs = useQuery({
    queryKey: ['/audit', query],
    queryFn: () => api.get<AuditPageData>(`/audit?${query}`),
  });

  const total = logs.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  /** Filtre degisince ilk sayfaya don; aksi halde bos sayfada kalinir. */
  function applyFilter(fn: () => void) {
    fn();
    setPage(1);
  }

  const columns = useMemo(
    () =>
      tableColumns<AuditLog>([
        {
          Header: 'Tarih',
          accessor: 'createdAt',
          width: 170,
          Cell: ({ value }: { value: string }) => formatDateTime(value),
        },
        {
          Header: 'Kullanıcı',
          id: 'user',
          width: 190,
          Cell: ({ row }: { row: { original: AuditLog } }) =>
            row.original.user?.fullName ?? '(silinmiş kullanıcı)',
        },
        {
          Header: 'Eylem',
          accessor: 'action',
          width: 170,
          Cell: ({ value }: { value: string }) => (
            <ObjectStatus state={ACTION_TONE[value] ?? 'None'}>
              {AUDIT_ACTION_LABEL[value] ?? value}
            </ObjectStatus>
          ),
        },
        {
          Header: 'Kayıt Türü',
          accessor: 'entity',
          width: 150,
          Cell: ({ value }: { value: string }) => AUDIT_ENTITY_LABEL[value] ?? value,
        },
        {
          Header: 'Ayrıntı',
          id: 'detail',
          minWidth: 260,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: AuditLog } }) => summarize(row.original),
        },
        { Header: 'IP', accessor: 'ip', width: 130 },
        {
          Header: '',
          id: 'actions',
          width: 90,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: AuditLog } }) => (
            <Button
              design="Transparent"
              icon="detail-view"
              tooltip="Ayrıntı"
              onClick={() => setDetail(row.original)}
            />
          ),
        },
      ]),
    [],
  );

  return (
    <div className="mp-page">
      <PageHeader
        title="Denetim Kaydı"
        subtitle="Sistemde yapılan işlemlerin değiştirilemez kaydı"
      />

      <div className="mp-card" style={{ marginBottom: '0.75rem' }}>
        <div
          style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
          }}
        >
          <div style={{ minWidth: '220px', flex: 1 }}>
            <Label showColon>Ara</Label>
            <Input
              style={{ width: '100%' }}
              placeholder="Kullanıcı, kayıt türü veya kayıt no"
              value={search}
              onInput={(e) => applyFilter(() => setSearch(e.target.value))}
            />
          </div>

          <div style={{ minWidth: '180px' }}>
            <Label showColon>Eylem</Label>
            <UiSelect
              style={{ width: '100%' }}
              value={action}
              placeholder="(tümü)"
              options={(filters.data?.actions ?? []).map((a) => ({
                value: a,
                label: AUDIT_ACTION_LABEL[a] ?? a,
              }))}
              onSelect={(v) => applyFilter(() => setAction(v))}
            />
          </div>

          <div style={{ minWidth: '180px' }}>
            <Label showColon>Kayıt Türü</Label>
            <UiSelect
              style={{ width: '100%' }}
              value={entity}
              placeholder="(tümü)"
              options={(filters.data?.entities ?? []).map((e) => ({
                value: e,
                label: AUDIT_ENTITY_LABEL[e] ?? e,
              }))}
              onSelect={(v) => applyFilter(() => setEntity(v))}
            />
          </div>

          <div style={{ minWidth: '200px' }}>
            <Label showColon>Kullanıcı</Label>
            <UiSelect
              style={{ width: '100%' }}
              value={userId}
              placeholder="(tümü)"
              options={(filters.data?.users ?? []).map((u) => ({
                value: u.id,
                label: u.fullName,
              }))}
              onSelect={(v) => applyFilter(() => setUserId(v))}
            />
          </div>

          <div style={{ width: '150px' }}>
            <Label showColon>Başlangıç</Label>
            <Input
              style={{ width: '100%' }}
              placeholder="gg.aa.yyyy"
              value={from}
              valueState={from && !fromIso ? 'Negative' : 'None'}
              onInput={(e) => applyFilter(() => setFrom(e.target.value))}
            />
          </div>

          <div style={{ width: '150px' }}>
            <Label showColon>Bitiş</Label>
            <Input
              style={{ width: '100%' }}
              placeholder="gg.aa.yyyy"
              value={to}
              valueState={to && !toIso ? 'Negative' : 'None'}
              onInput={(e) => applyFilter(() => setTo(e.target.value))}
            />
          </div>

          <Button
            design="Transparent"
            icon="clear-filter"
            onClick={() =>
              applyFilter(() => {
                setSearch('');
                setAction('');
                setEntity('');
                setUserId('');
                setFrom('');
                setTo('');
              })
            }
          >
            Filtreleri Temizle
          </Button>
          <Button design="Transparent" icon="refresh" onClick={() => logs.refetch()}>
            Yenile
          </Button>
        </div>
      </div>

      <AnalyticalTable
        columns={columns}
        data={logs.data?.rows ?? []}
        loading={logs.isLoading}
        visibleRows={15}
        noDataText={
          logs.isError ? 'Kayıtlar yüklenemedi.' : 'Bu filtrelerle denetim kaydı bulunamadı.'
        }
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: '0.75rem',
        }}
      >
        <Text>
          Toplam {total} kayıt · Sayfa {page} / {pageCount}
        </Text>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button
            design="Transparent"
            icon="navigation-left-arrow"
            disabled={page <= 1 || logs.isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Önceki
          </Button>
          <Button
            design="Transparent"
            icon="navigation-right-arrow"
            disabled={page >= pageCount || logs.isFetching}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
          >
            Sonraki
          </Button>
        </div>
      </div>

      {detail && (
        <Dialog
          open
          headerText={`${AUDIT_ACTION_LABEL[detail.action] ?? detail.action} · ${
            AUDIT_ENTITY_LABEL[detail.entity] ?? detail.entity
          }`}
          onClose={() => setDetail(null)}
          footer={
            <Bar
              design="Footer"
              endContent={
                <Button design="Emphasized" onClick={() => setDetail(null)}>
                  Kapat
                </Button>
              }
            />
          }
        >
          <div style={{ display: 'grid', gap: '0.6rem', minWidth: 'min(560px, 80vw)' }}>
            <Row label="Tarih" value={formatDateTime(detail.createdAt)} />
            <Row
              label="Kullanıcı"
              value={
                detail.user
                  ? `${detail.user.fullName} (${detail.user.username})`
                  : '(silinmiş kullanıcı)'
              }
            />
            <Row label="Kayıt No" value={detail.entityId ?? '-'} />
            <Row label="IP" value={detail.ip ?? '-'} />
            <div>
              <Label showColon>Değişiklik Ayrıntısı</Label>
              <pre className="mp-audit-detail">
                {detail.detail ? JSON.stringify(detail.detail, null, 2) : '(ayrıntı kaydedilmemiş)'}
              </pre>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem' }}>
      <Label showColon style={{ minWidth: '110px' }}>
        {label}
      </Label>
      <Text>{value}</Text>
    </div>
  );
}

/** Tablo satirinda gosterilecek kisa ozet. */
function summarize(log: AuditLog): string {
  const d = log.detail as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== 'object') return log.entityId ?? '-';

  const parts: string[] = [];
  if (typeof d.orderNo === 'string') parts.push(d.orderNo);
  if (typeof d.code === 'string') parts.push(d.code);
  if (typeof d.username === 'string') parts.push(d.username);
  if (typeof d.step === 'string') parts.push(d.step);

  const from = (d.from ?? null) as unknown;
  const to = (d.to ?? null) as unknown;
  if (typeof from === 'string' && typeof to === 'string') parts.push(`${from} → ${to}`);

  if (d.isAdmin && typeof d.isAdmin === 'object') parts.push('yönetici yetkisi değişti');
  if (d.permissions && typeof d.permissions === 'object') parts.push('yetkiler değişti');
  if (d.passwordReset === true) parts.push('şifre sıfırlandı');

  return parts.length ? parts.join(' · ') : (log.entityId ?? '-');
}
