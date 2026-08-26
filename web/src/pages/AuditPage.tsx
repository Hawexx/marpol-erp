import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  Button,
  DatePicker,
  Dialog,
  Input,
  Label,
  ObjectStatus,
} from '@ui5/webcomponents-react';
import { api } from '../api/client.js';
import { Pagination } from '../components/Pagination.js';
import { tableEmptyText } from '../components/states.js';
import { UiSelect } from '../components/UiSelect.js';
import { DataTable } from '../components/DataTable.js';
import { actionColumn, columns as tableColumns } from '../components/table.js';
import {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  Field,
  ListSection,
  PageHeader,
  Section,
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
          ...actionColumn(1, { Header: '' }),
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
    <div className="mp-page mp-page--wide">
      <PageHeader
        title="Denetim Kaydı"
        subtitle="Sistemde yapılan işlemlerin değiştirilemez kaydı"
      />

      <Section>
        <div className="mp-filters">
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

          <div style={{ width: '160px' }}>
            <Label showColon>Başlangıç</Label>
            <DatePicker
              style={{ width: '100%' }}
              formatPattern="dd.MM.yyyy"
              value={from}
              valueState={from && !fromIso ? 'Negative' : 'None'}
              onChange={(e) => applyFilter(() => setFrom(e.target.value ?? ''))}
            />
          </div>

          <div style={{ width: '160px' }}>
            <Label showColon>Bitiş</Label>
            <DatePicker
              style={{ width: '100%' }}
              formatPattern="dd.MM.yyyy"
              value={to}
              valueState={to && !toIso ? 'Negative' : 'None'}
              onChange={(e) => applyFilter(() => setTo(e.target.value ?? ''))}
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
      </Section>

      <ListSection>
        <DataTable
          columns={columns}
          data={logs.data?.rows ?? []}
          loading={logs.isLoading}
          noDataText={tableEmptyText({
            isError: logs.isError,
            filtered: Boolean(search || action || entity || userId || from || to),
            empty: 'Henüz denetim kaydı oluşmamış.',
            noResults: 'Bu filtrelerle denetim kaydı bulunamadı.',
          })}
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          busy={logs.isFetching}
          onChange={setPage}
        />
      </ListSection>

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
            <Field orientation="inline" label="Tarih" value={formatDateTime(detail.createdAt)} />
            <Field orientation="inline"
              label="Kullanıcı"
              value={
                detail.user
                  ? `${detail.user.fullName} (${detail.user.username})`
                  : '(silinmiş kullanıcı)'
              }
            />
            <Field orientation="inline" label="Kayıt No" value={detail.entityId ?? '-'} />
            <Field orientation="inline" label="IP" value={detail.ip ?? '-'} />
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
