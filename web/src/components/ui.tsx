import type { ReactNode } from 'react';
import { ObjectStatus, Title } from '@ui5/webcomponents-react';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/format.js';
import type { OrderStatus, Priority } from '../api/types.js';

// Etiketler ve bicimlendiriciler UI'dan bagimsiz modulde durur; sayfalarin
// tek yerden almasi icin buradan yeniden disari verilir.
export {
  AUDIT_ACTION_LABEL,
  AUDIT_ENTITY_LABEL,
  MODULE_LABEL,
  NODE_TYPE_LABEL,
  PRIORITY_LABEL,
  STATUS_LABEL,
  STEP_LABEL,
  STOCK_REASON_LABEL,
  daysUntil,
  formatDate,
  formatDateTime,
  formatNumber,
  toDateInput,
  trToIsoDate,
} from '../lib/format.js';

/** Sayfa basligi ve sag ustteki islem butonlari. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mp-page__header">
      <div>
        {/* UI5'te bir basligin GORSEL boyutunu `level` degil `size` belirler;
            `size` verilmezse varsayilani "H5"tir. Yani `level="H3"` yazan eski
            kod sayfa basligini kart baslikariyla ayni 16px'te ciziyordu.
            `level` semantik (h1), `size` gorsel (24px) olarak ayrilir. */}
        <Title level="H1" size="H3">
          {title}
        </Title>
        {subtitle && <div className="mp-page__subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="mp-page__header-actions">{actions}</div>}
    </div>
  );
}

/**
 * Sayfa icindeki icerik blogu: kenarlikli, golgeli yuzey + istege bagli baslik.
 *
 * Onceden her sayfa `<div className="mp-card">` yazip baslik ve araligi kendi
 * inline stiliyle kuruyordu; ayni kalip sayfadan sayfaya farkli goruniyordu.
 */
export function Section({
  title,
  subtitle,
  actions,
  /** Icerik kendi yuzeyini getiriyorsa (tablo, tuval) kart dolgusunu kaldirir. */
  flush = false,
  compact = false,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  flush?: boolean;
  compact?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const classes = [
    'mp-surface',
    flush ? 'mp-surface--flush' : '',
    compact ? 'mp-surface--compact' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className={classes}>
      {(title || actions) && (
        <div className="mp-surface__head">
          <div>
            {title && (
              <Title level="H2" size="H5">
                {title}
              </Title>
            )}
            {subtitle && <div className="mp-surface__subtitle">{subtitle}</div>}
          </div>
          {actions && <div className="mp-surface__actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Tablo tasiyan bolum: tablo kenardan kenara otursun diye dolgusuz yuzey. */
export function ListSection({
  title,
  subtitle,
  actions,
  className,
  children,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Section flush title={title} subtitle={subtitle} actions={actions} className={className}>
      {children}
    </Section>
  );
}

/**
 * Etiket + deger cifti.
 *
 * `stack` (varsayilan) etiketi degerin ustune koyar - emir detayinda kullanilir.
 * `inline` yan yana dizer - denetim kaydi ayrintisinda kullanilir. Iki sayfa
 * bu kalibi ayri ayri kopyalamisti.
 */
export function Field({
  label,
  value,
  orientation = 'stack',
}: {
  label: string;
  value: ReactNode;
  orientation?: 'stack' | 'inline';
}) {
  return (
    <div className={orientation === 'inline' ? 'mp-field mp-field--inline' : 'mp-field'}>
      <div className="mp-field__label">{orientation === 'inline' ? `${label}:` : label}</div>
      <div className="mp-field__value">{value ?? '-'}</div>
    </div>
  );
}

/** Field'lari esit genislikli, kendiliginden saran bir izgaraya dizer. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="mp-fieldgroup">{children}</div>;
}

export function KpiTile({
  label,
  value,
  tone = 'info',
}: {
  label: string;
  value: ReactNode;
  tone?: 'info' | 'good' | 'warning' | 'critical';
}) {
  return (
    <div className={`mp-kpi mp-kpi--${tone}`}>
      <div className="mp-kpi__label">{label}</div>
      <div className="mp-kpi__value">{value}</div>
    </div>
  );
}

export const STATUS_TONE: Record<OrderStatus, 'None' | 'Positive' | 'Critical' | 'Negative' | 'Information'> =
  {
    TASLAK: 'None',
    ONAY_BEKLIYOR: 'Critical',
    PLANLANDI: 'Information',
    URETIMDE: 'Information',
    BEKLEMEDE: 'Critical',
    TAMAMLANDI: 'Positive',
    IPTAL: 'Negative',
  };

const PRIORITY_TONE: Record<Priority, 'None' | 'Positive' | 'Critical' | 'Negative'> = {
  DUSUK: 'None',
  NORMAL: 'Positive',
  YUKSEK: 'Critical',
  KRITIK: 'Negative',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <ObjectStatus state={STATUS_TONE[status]}>{STATUS_LABEL[status]}</ObjectStatus>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <ObjectStatus state={PRIORITY_TONE[priority]} showDefaultIcon={priority === 'KRITIK'}>
      {PRIORITY_LABEL[priority]}
    </ObjectStatus>
  );
}
