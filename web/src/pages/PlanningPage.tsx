import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  MessageStrip,
  ObjectStatus,
  Tab,
  TabContainer,
  Text,
} from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { DataTable } from '../components/DataTable.js';
import { columns as tableColumns } from '../components/table.js';
import { ErrorState, LoadingState } from '../components/states.js';
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

      {tab === 'ozet' && (
        <Dashboard
          data={d}
          loading={dashboard.isLoading}
          isError={dashboard.isError}
          onRetry={() => dashboard.refetch()}
        />
      )}
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

function Dashboard({
  data,
  loading,
  isError,
  onRetry,
}: {
  data?: DashboardData;
  loading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  if (loading && !data) {
    return (
      <Section flush>
        <LoadingState text="Pano hazırlanıyor..." />
      </Section>
    );
  }
  // Istek basarisiz olduğunda eskiden hicbir sey cizilmiyordu: kullanici
  // bos bir sayfayla kaliyordu.
  if (!data) {
    return (
      <Section flush>
        <ErrorState
          title="Pano verileri yüklenemedi"
          description="Bağlantınızı kontrol edip yeniden deneyin."
          onRetry={isError ? onRetry : undefined}
        />
      </Section>
    );
  }

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
          label="Üretilen"
          value={formatNumber(data.production.produced)}
          unit="adet"
          hint="Tamamlanan emirler"
          tone="good"
        />
        <KpiTile
          label="Fire Oranı"
          value={data.production.scrapRate.toFixed(1)}
          unit="%"
          tone={data.production.scrapRate > 5 ? 'critical' : 'good'}
        />
      </div>

      <div className="mp-split">
        <Section title="Durum Dağılımı" className="mp-split__col">
          <BarList
            caption="Tüm emirler"
            items={(Object.keys(STATUS_LABEL) as OrderStatus[]).map((s) => ({
              label: STATUS_LABEL[s],
              value: data.byStatus[s] ?? 0,
            }))}
          />
        </Section>

        <Section title="Açık Emirlerde Aciliyet" className="mp-split__col">
          <BarList
            caption="Yalnızca açık emirler"
            items={(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => ({
              label: PRIORITY_LABEL[p],
              value: data.byPriority[p] ?? 0,
            }))}
          />
        </Section>
      </div>

      <Section title="Son 30 Gün Üretimi" subtitle="Tamamlanan emirlerin günlük sağlam ve fire adetleri">
        {data.daily.length === 0 ? (
          <Text>Bu dönemde tamamlanmış emir yok.</Text>
        ) : (
          <DailyChart days={data.daily} max={enYuksekGunluk} />
        )}
      </Section>
    </>
  );
}

/**
 * Gunluk uretim sutun grafigi.
 *
 * Cubuk yuksekligi PIKSEL degil YUZDE: en yuksek cubuk cizim alaninin
 * tamamini kaplar. Onceki surumde yukseklik en fazla 120px hesaplaniyordu
 * ama kap 160px'ti (ustte olu bant), dar ekranda ise kap 120px'e indigi
 * halde cubuk yine 120px hesaplandigi icin tasiyordu.
 */
interface BarItem {
  label: string;
  value: number;
}

function DailyChart({
  days,
  max,
}: {
  days: DashboardData['daily'];
  max: number;
}) {
  const [okunan, setOkunan] = useState<string>('');

  const oku = (gun: DashboardData['daily'][number]) =>
    `${formatDate(gun.date)} - ${formatNumber(gun.produced)} sağlam, ` +
    `${formatNumber(gun.scrap)} fire, ${formatNumber(gun.orders)} emir`;

  return (
    <div>
      <div className="mp-chart__legend">
        <span className="mp-chart__key">
          <span className="mp-chart__swatch mp-chart__swatch--produced" /> Sağlam
        </span>
        <span className="mp-chart__key">
          <span className="mp-chart__swatch mp-chart__swatch--scrap" /> Fire
        </span>
      </div>

      <div className="mp-chart">
        <div className="mp-chart__axis" aria-hidden="true">
          <span>{formatNumber(max)}</span>
          <span>{formatNumber(Math.round(max / 2))}</span>
          <span>0</span>
        </div>

        <div className="mp-chart__plot">
          <div className="mp-daily">
            {days.map((gun, i) => {
              const toplam = gun.produced + gun.scrap;
              // Yuzde: en yuksek gun %100, cizim alaninin tam tepesi.
              const yukseklik = max > 0 ? (toplam / max) * 100 : 0;
              const firePay = toplam > 0 ? (gun.scrap / toplam) * 100 : 0;
              // Ay siniri: "30 31 01 02" dizisinde ayin nerede degistigi
              // hicbir yerde belli olmuyordu.
              const ayBasi = i > 0 && gun.date.slice(5, 7) !== days[i - 1].date.slice(5, 7);
              return (
                <div
                  key={gun.date}
                  className={`mp-daily__bar${ayBasi ? ' mp-daily__bar--month-start' : ''}`}
                  tabIndex={0}
                  role="img"
                  aria-label={oku(gun)}
                  onMouseEnter={() => setOkunan(oku(gun))}
                  onFocus={() => setOkunan(oku(gun))}
                  onMouseLeave={() => setOkunan('')}
                  onBlur={() => setOkunan('')}
                >
                  <div className="mp-daily__track">
                    <div className="mp-daily__stack" style={{ height: `${yukseklik}%` }}>
                      <div className="mp-daily__scrap" style={{ height: `${firePay}%` }} />
                    </div>
                  </div>
                  <span className="mp-daily__label">
                    {ayBasi ? gun.date.slice(5, 7) + '/' : ''}
                    {gun.date.slice(8)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Kirpilabilen native tooltip yerine her zaman gorunen sabit satir. */}
      <div className="mp-chart__readout" aria-live="polite">
        {okunan || 'Bir güne gelin veya sekmeyle odaklanın.'}
      </div>
    </div>
  );
}

/**
 * Basit yatay cubuk listesi; harici grafik kutuphanesi gerektirmez.
 *
 * Etiket eskiden sabit %40'lik bir sutundaydi ve uzun Turkce etiketler
 * ("Onay Bekliyor", "Uretimde") kirpiliyordu. Artik iki satirlik bir
 * izgara: ust satirda etiket ve deger, alt satirda cubuk.
 *
 * DIKKAT: deger buyuklugune gore SIRALANMAZ. Hem durum hem aciliyet sirali
 * olceklerdir (taslak -> tamamlandi, dusuk -> kritik); siralama okuyucunun
 * bekledigi duzeni bozar.
 */
function BarList({ items, caption }: { items: BarItem[]; caption: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const toplam = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <div>
      {/* Iki grafigin farki RENKLE degil bu satirla anlatiliyor: asil
          karisiklik hangi popülasyonun sayildiginin hicbir yerde
          yazmamasiydi. */}
      <div className="mp-overline mp-barlist__caption">
        {caption} · {formatNumber(toplam)}
      </div>
      <div className="mp-barlist">
        {items.map((item) => (
          <div key={item.label} className="mp-barlist__row">
            <div className="mp-barlist__head">
              <span className="mp-barlist__label">{item.label}</span>
              <strong className="mp-barlist__value">{formatNumber(item.value)}</strong>
            </div>
            <div className="mp-bar">
              <div className="mp-bar__fill" style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
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
        <DataTable
          columns={columns}
          data={rows}
          loading={loading}
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

  /*
   * Zaman cetveli EN ERKEN BASLANGICTAN en gec termine uzanir.
   *
   * Onceden eksen "bugun"den basliyordu; bu yuzden bugun cizgisi her zaman
   * %0'da, yani sol kenarda kaliyor ve hicbir bilgi tasimiyordu. Ustelik her
   * cubugun sol kenari da 0'a kirpiliyor, termini gecmis emirler ise %2'lik
   * gudUk bir cubuga iniyordu. Eksen iki uca da yayilinca bugun cizgisi
   * anlamli bir yere oturuyor ve gecikme gozle goruluyor.
   */
  const { bugun, enErken, enGec, yuzde, bugunYuzde, sirali } = useMemo(() => {
    const simdi = Date.now();
    const zamanlar = rows.flatMap((r) => [
      new Date(r.deadline).getTime(),
      r.startedAt ? new Date(r.startedAt).getTime() : simdi,
    ]);
    const ilk = Math.min(simdi, ...zamanlar);
    const son = Math.max(simdi, ...zamanlar);
    const genislik = Math.max(1, son - ilk);
    const oran = (t: number) => ((t - ilk) / genislik) * 100;
    return {
      bugun: simdi,
      enErken: ilk,
      enGec: son,
      yuzde: oran,
      bugunYuzde: oran(simdi),
      // Merdiven okunabilir olsun diye satirlar termine gore siralanir.
      sirali: [...rows].sort(
        (a, b) => new Date(a.deadline).getTime() - new Date(b.deadline).getTime(),
      ),
    };
  }, [rows]);

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
          // Baslik bir bilesen olabilir ama `headerLabel` ZORUNLU: sutun
          // menusu ve erisilebilirlik adi duz metin bekliyor.
          Header: () => (
            <div className="mp-gantt-axis">
              <span>{formatDate(new Date(enErken).toISOString())}</span>
              <span className="mp-gantt-axis__today" style={{ left: `${bugunYuzde}%` }}>
                Bugün
              </span>
              <span>{formatDate(new Date(enGec).toISOString())}</span>
            </div>
          ),
          headerLabel: 'Zaman Çizelgesi',
          id: 'timeline',
          minWidth: 260,
          disableFilters: true,
          disableSortBy: true,
          Cell: ({ row }: { row: { original: ScheduleRow } }) => {
            const o = row.original;
            const bitis = new Date(o.deadline).getTime();
            const baslangic = o.startedAt ? new Date(o.startedAt).getTime() : bugun;
            const sol = yuzde(Math.min(baslangic, bitis));
            const genislik = Math.max(1.5, yuzde(Math.max(baslangic, bitis)) - sol);
            return (
              <div
                className="mp-gantt"
                title={`${formatDate(o.deadline)} termini`}
              >
                {/* Her satirda bugun izi: eksendeki "Bugün" ile ayni x'te. */}
                <span className="mp-gantt__today" style={{ left: `${bugunYuzde}%` }} />
                <div
                  className={`mp-gantt__bar mp-gantt__bar--${o.risk}`}
                  style={{ left: `${sol}%`, width: `${genislik}%` }}
                />
              </div>
            );
          },
        },
      ]),
    [bugun, bugunYuzde, enErken, enGec, yuzde],
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
        <DataTable
          columns={columns}
          headerRowHeight={52}
          data={sirali}
          loading={loading}
          noDataText={isError ? 'Takvim yüklenemedi.' : 'Planlanacak açık emir bulunamadı.'}
        />
      </ListSection>
    </>
  );
}
