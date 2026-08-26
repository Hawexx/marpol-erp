import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AnalyticalTable,
  Button,
  MessageStrip,
  ObjectStatus,
  Tab,
  TabContainer,
  Text,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { columns as tableColumns } from '../components/table.js';
import {
  KpiTile,
  ListSection,
  PRIORITY_LABEL,
  PageHeader,
  PriorityBadge,
  STATUS_LABEL,
  Section,
  StatusBadge,
  formatDate,
  formatNumber,
} from '../components/ui.js';
import type {
  DashboardData,
  MachineLoadRow,
  OrderStatus,
  Priority,
  ScheduleRisk,
  ScheduleRow,
} from '../api/types.js';

const RISK_LABEL: Record<ScheduleRisk, string> = {
  ok: 'Zamanında',
  risk: 'Riskli',
  overdue: 'Gecikmiş',
  unknown: 'Süre girilmemiş',
};

const RISK_TONE: Record<ScheduleRisk, 'Positive' | 'Critical' | 'Negative' | 'None'> = {
  ok: 'Positive',
  risk: 'Critical',
  overdue: 'Negative',
  unknown: 'None',
};

/** Dakikayi "3 sa 20 dk" bicimine cevirir. */
function formatMinutes(minutes: number): string {
  if (!minutes) return '-';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} dk`;
  return m === 0 ? `${h} sa` : `${h} sa ${m} dk`;
}

export default function PlanningPage() {
  const [tab, setTab] = useState<'ozet' | 'makine' | 'takvim'>('ozet');

  const dashboard = useQuery({
    queryKey: ['/planning/dashboard'],
    queryFn: () => api.get<DashboardData>('/planning/dashboard'),
    // Saha panosu acik birakildiginda guncel kalsin.
    refetchInterval: 60_000,
  });

  const machines = useQuery({
    queryKey: ['/planning/machine-load'],
    queryFn: () => api.get<{ rows: MachineLoadRow[]; shiftMinutes: number }>(
      '/planning/machine-load',
    ),
    enabled: tab === 'makine',
    refetchInterval: 60_000,
  });

  const schedule = useQuery({
    queryKey: ['/planning/schedule'],
    queryFn: () => api.get<{ rows: ScheduleRow[]; shiftMinutes: number }>('/planning/schedule'),
    enabled: tab === 'takvim',
    refetchInterval: 60_000,
  });

  const d = dashboard.data;

  return (
    <div className="mp-page mp-page--wide">
      <PageHeader
        title="Üretim Planlama"
        subtitle="Üretim panosu, makine yükü ve termin takvimi"
        actions={
          <Button
            design="Transparent"
            icon="refresh"
            onClick={() => {
              dashboard.refetch();
              machines.refetch();
              schedule.refetch();
            }}
          >
            Yenile
          </Button>
        }
      />

      {dashboard.isError && (
        <MessageStrip design="Negative" hideCloseButton>
          Pano verileri yüklenemedi. {errorMessage(dashboard.error)}
        </MessageStrip>
      )}

      <TabContainer
        onTabSelect={(e) => {
          const key = (e.detail.tab as HTMLElement).dataset.key as typeof tab;
          if (key) setTab(key);
        }}
      >
        <Tab text="Üretim Panosu" data-key="ozet" selected={tab === 'ozet'} />
        <Tab text="Makine Yükü" data-key="makine" selected={tab === 'makine'} />
        <Tab text="Termin Takvimi" data-key="takvim" selected={tab === 'takvim'} />
      </TabContainer>

      {tab === 'ozet' && <Dashboard data={d} loading={dashboard.isLoading} />}
      {tab === 'makine' && (
        <MachineLoad
          rows={machines.data?.rows ?? []}
          loading={machines.isLoading}
          isError={machines.isError}
        />
      )}
      {tab === 'takvim' && (
        <Schedule
          rows={schedule.data?.rows ?? []}
          loading={schedule.isLoading}
          isError={schedule.isError}
        />
      )}
    </div>
  );
}

function Dashboard({ data, loading }: { data?: DashboardData; loading: boolean }) {
  if (loading && !data) return <Section>Yükleniyor...</Section>;
  if (!data) return null;

  const enYuksekGunluk = Math.max(1, ...data.daily.map((g) => g.produced + g.scrap));

  return (
    <>
      <div className="mp-kpis">
        <KpiTile label="Açık Emir" value={formatNumber(data.openOrders)} tone="info" />
        <KpiTile
          label="Bu Hafta Terminli"
          value={formatNumber(data.dueThisWeek)}
          tone="warning"
        />
        <KpiTile label="Termini Geçen" value={formatNumber(data.overdue)} tone="critical" />
        <KpiTile
          label="Üretilen (tamamlanan emirler)"
          value={formatNumber(data.production.produced)}
          tone="good"
        />
        <KpiTile
          label="Fire Oranı"
          value={`%${data.production.scrapRate.toFixed(1)}`}
          tone={data.production.scrapRate > 5 ? 'critical' : 'good'}
        />
      </div>

      <div className="mp-split">
        <Section title="Durum Dağılımı" className="mp-split__col">
          <BarList
            items={(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => ({
              label: STATUS_LABEL[s],
              value: data.byStatus[s] ?? 0,
            }))}
          />
        </Section>

        <Section title="Açık Emirlerde Aciliyet" className="mp-split__col">
          <BarList
            items={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({
              label: PRIORITY_LABEL[p],
              value: data.byPriority[p] ?? 0,
            }))}
          />
        </Section>
      </div>

      <Section title="Son 30 Gün Üretimi">
        {data.daily.length === 0 ? (
          <Text>Bu dönemde tamamlanmış emir yok.</Text>
        ) : (
          <div className="mp-daily">
            {data.daily.map((gun) => {
              const toplam = gun.produced + gun.scrap;
              const yukseklik = Math.max(4, (toplam / enYuksekGunluk) * 120);
              const firePay = toplam > 0 ? (gun.scrap / toplam) * 100 : 0;
              return (
                <div
                  key={gun.date}
                  className="mp-daily__bar"
                  title={`${formatDate(gun.date)} — ${formatNumber(gun.produced)} sağlam, ${formatNumber(
                    gun.scrap,
                  )} fire (${gun.orders} emir)`}
                >
                  <div className="mp-daily__stack" style={{ height: `${yukseklik}px` }}>
                    <div className="mp-daily__scrap" style={{ height: `${firePay}%` }} />
                  </div>
                  <span className="mp-daily__label">{gun.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
    </>
  );
}

/** Basit yatay cubuk listesi; harici grafik kutuphanesi gerektirmez. */
function BarList({ items }: { items: { label: string; value: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div style={{ display: 'grid', gap: '0.4rem', marginTop: '0.5rem' }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: '40%', fontSize: '0.8125rem' }}>{item.label}</span>
          <div className="mp-bar">
            <div className="mp-bar__fill" style={{ width: `${(item.value / max) * 100}%` }} />
          </div>
          <strong style={{ width: '3rem', textAlign: 'right' }}>{formatNumber(item.value)}</strong>
        </div>
      ))}
    </div>
  );
}

function MachineLoad({
  rows,
  loading,
  isError,
}: {
  rows: MachineLoadRow[];
  loading: boolean;
  isError: boolean;
}) {
  const enYuksek = Math.max(1, ...rows.map((r) => r.queuedMinutes));

  const columns = useMemo(
    () =>
      tableColumns<MachineLoadRow>([
        { Header: 'Kod', accessor: 'code', width: 110 },
        { Header: 'Makine', accessor: 'name', minWidth: 180 },
        { Header: 'Hat', accessor: 'line', width: 110 },
        {
          Header: 'Kapasite',
          accessor: 'capacity',
          width: 120,
          hAlign: 'End' as const,
          Cell: ({ value }: { value?: number | null }) =>
            value ? `${formatNumber(value)} adet/sa` : '-',
        },
        {
          Header: 'Bekleyen Emir',
          accessor: 'orderCount',
          width: 130,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => formatNumber(value),
        },
        {
          Header: 'Bekleyen Adet',
          accessor: 'queuedUnits',
          width: 130,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => formatNumber(value),
        },
        {
          Header: 'Tahmini Süre',
          accessor: 'queuedMinutes',
          width: 140,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => formatMinutes(value),
        },
        {
          Header: 'Yük',
          id: 'load',
          minWidth: 160,
          disableFilters: true,
          Cell: ({ row }: { row: { original: MachineLoadRow } }) => (
            <div className="mp-bar" style={{ minWidth: '120px' }}>
              <div
                className="mp-bar__fill"
                style={{ width: `${(row.original.queuedMinutes / enYuksek) * 100}%` }}
              />
            </div>
          ),
        },
        {
          Header: 'Vardiya',
          accessor: 'queuedShifts',
          width: 110,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => (
            <ObjectStatus state={value > 3 ? 'Negative' : value > 1 ? 'Critical' : 'Positive'}>
              {value.toFixed(1)}
            </ObjectStatus>
          ),
        },
      ]),
    [enYuksek],
  );

  return (
    <>
      <MessageStrip design="Information" hideCloseButton>
        Süreler, adımın sabit işlem süresi ile adedin makine kapasitesine bölünmesiyle
        hesaplanır. Vardiya 8 saat kabul edilmiştir. Kapasitesi girilmemiş makinelerde yalnızca
        sabit süre sayılır.
      </MessageStrip>
      <ListSection title="Makine Yükü">
        <AnalyticalTable
          columns={columns}
          data={rows}
          loading={loading}
          visibleRows={12}
          noDataText={
            isError ? 'Makine yükü yüklenemedi.' : 'Aktif makine veya bekleyen iş bulunamadı.'
          }
        />
      </ListSection>
    </>
  );
}

function Schedule({
  rows,
  loading,
  isError,
}: {
  rows: ScheduleRow[];
  loading: boolean;
  isError: boolean;
}) {
  const riskli = rows.filter((r) => r.risk === 'risk').length;
  const gecikmis = rows.filter((r) => r.risk === 'overdue').length;

  // Zaman cetveli: bugunden en uzak termine kadar.
  const bugun = Date.now();
  const enUzak = Math.max(bugun, ...rows.map((r) => new Date(r.deadline).getTime()));
  const aralik = Math.max(1, enUzak - bugun);

  const columns = useMemo(
    () =>
      tableColumns<ScheduleRow>([
        { Header: 'Emir No', accessor: 'orderNo', width: 140 },
        {
          Header: 'Durum',
          accessor: 'status',
          width: 130,
          Cell: ({ value }: { value: OrderStatus }) => <StatusBadge status={value} />,
        },
        {
          Header: 'Aciliyet',
          id: 'priority',
          width: 110,
          Cell: ({ row }: { row: { original: ScheduleRow } }) => (
            <PriorityBadge priority={row.original.priority} />
          ),
        },
        { Header: 'Müşteri', accessor: 'customer', width: 160 },
        {
          Header: 'Adet',
          accessor: 'quantity',
          width: 90,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => formatNumber(value),
        },
        {
          Header: 'İlerleme',
          accessor: 'progress',
          width: 130,
          Cell: ({ value }: { value: number }) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <div className="mp-bar" style={{ minWidth: '60px' }}>
                <div className="mp-bar__fill" style={{ width: `${value}%` }} />
              </div>
              <span style={{ fontSize: '0.75rem' }}>%{value.toFixed(0)}</span>
            </div>
          ),
        },
        {
          Header: 'Kalan İş',
          accessor: 'remainingMinutes',
          width: 120,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => formatMinutes(value),
        },
        {
          Header: 'Termin',
          accessor: 'deadline',
          width: 120,
          Cell: ({ value }: { value: string }) => formatDate(value),
        },
        {
          Header: 'Kalan Gün',
          accessor: 'daysLeft',
          width: 110,
          hAlign: 'End' as const,
          Cell: ({ value }: { value: number }) => (
            <ObjectStatus state={value < 0 ? 'Negative' : value <= 3 ? 'Critical' : 'None'}>
              {value < 0 ? `${Math.abs(value)} gün gecikme` : `${value} gün`}
            </ObjectStatus>
          ),
        },
        {
          Header: 'Durum Değerlendirmesi',
          accessor: 'risk',
          width: 170,
          Cell: ({ value }: { value: ScheduleRisk }) => (
            <ObjectStatus state={RISK_TONE[value]}>{RISK_LABEL[value]}</ObjectStatus>
          ),
        },
        {
          Header: 'Zaman Çizelgesi',
          id: 'timeline',
          minWidth: 220,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: ScheduleRow } }) => {
            const o = row.original;
            const bitis = new Date(o.deadline).getTime();
            const baslangic = o.startedAt ? new Date(o.startedAt).getTime() : bugun;
            const sol = Math.max(0, ((Math.min(baslangic, bugun) - bugun) / aralik) * 100);
            const genislik = Math.max(2, ((bitis - Math.max(baslangic, bugun)) / aralik) * 100);
            return (
              <div className="mp-gantt" title={`${formatDate(o.deadline)} termini`}>
                <div
                  className={`mp-gantt__bar mp-gantt__bar--${o.risk}`}
                  style={{ left: `${sol}%`, width: `${genislik}%` }}
                />
              </div>
            );
          },
        },
      ]),
    [aralik, bugun],
  );

  return (
    <>
      {(riskli > 0 || gecikmis > 0) && (
        <MessageStrip design="Critical" hideCloseButton>
          {gecikmis > 0 && <strong>{gecikmis} emir gecikmiş. </strong>}
          {riskli > 0 && (
            <>
              {riskli} emrin kalan işi termine sığmıyor görünüyor (günde tek vardiya varsayımıyla).
            </>
          )}
        </MessageStrip>
      )}
      <ListSection title="Termin Takvimi">
        <AnalyticalTable
          columns={columns}
          data={rows}
          loading={loading}
          visibleRows={12}
          noDataText={isError ? 'Takvim yüklenemedi.' : 'Planlanacak açık emir bulunamadı.'}
        />
      </ListSection>
    </>
  );
}
