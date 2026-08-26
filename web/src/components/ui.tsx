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
        <Title level="H3">{title}</Title>
        {subtitle && <div className="mp-page__subtitle">{subtitle}</div>}
      </div>
      {actions && <div style={{ display: 'flex', gap: '0.5rem' }}>{actions}</div>}
    </div>
  );
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

const STATUS_TONE: Record<OrderStatus, 'None' | 'Positive' | 'Critical' | 'Negative' | 'Information'> =
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
