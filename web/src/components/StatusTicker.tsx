import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { formatNumber } from './ui.js';
import type { OrderSummary, ProductionOrder } from '../api/types.js';

/** Tamamlanmamis emirler - kritik aciliyet listesi bunlarla sinirlidir. */
const OPEN_STATUSES = 'TASLAK,ONAY_BEKLIYOR,PLANLANDI,URETIMDE,BEKLEMEDE';

interface TickerItem {
  label: string;
  value: string;
  tone?: 'critical';
}

/**
 * ShellBar'in orta alaninda sagdan sola akan uretim ozeti.
 * Kritik aciliyetli emirlerin musterileri kirmizi olarak seridin sonunda listelenir.
 *
 * `slot` prop'u UI5 tarafindan gecirilir ve en dis elemana uygulanmalidir.
 */
export function StatusTicker({ slot }: { slot?: string }) {
  const { can } = useAuth();
  const enabled = can('URETIM_EMIRLERI') || can('URETIM_EMRI_OLUSTUR');

  const summary = useQuery({
    queryKey: ['/orders/summary'],
    queryFn: () => api.get<OrderSummary>('/orders/summary'),
    enabled,
    refetchInterval: 60_000,
  });

  const critical = useQuery({
    queryKey: ['/orders', 'ticker-kritik'],
    queryFn: () =>
      api.get<ProductionOrder[]>(`/orders?priority=KRITIK&status=${OPEN_STATUSES}`),
    enabled,
    refetchInterval: 60_000,
  });

  if (!enabled || !summary.data) return null;

  const s = summary.data;
  const items: TickerItem[] = [
    { label: 'Toplam Emir', value: formatNumber(s.total) },
    { label: 'Onay Bekleyen', value: formatNumber(s.byStatus.ONAY_BEKLIYOR ?? 0) },
    { label: 'Üretimde', value: formatNumber(s.byStatus.URETIMDE ?? 0) },
    { label: 'Tamamlanan', value: formatNumber(s.byStatus.TAMAMLANDI ?? 0) },
    {
      label: 'Termini Geçen',
      value: formatNumber(s.overdue),
      ...(s.overdue > 0 ? { tone: 'critical' as const } : {}),
    },
    {
      label: 'Kritik Aciliyet',
      value: formatNumber(s.byPriority.KRITIK ?? 0),
      ...((s.byPriority.KRITIK ?? 0) > 0 ? { tone: 'critical' as const } : {}),
    },
  ];

  const criticalOrders = critical.data ?? [];

  // Serit kesintisiz aksin diye ayni icerik iki kez basilir; animasyon
  // tam yarisinda basa doner.
  const group = (
    <div className="mp-ticker__group">
      {items.map((item) => (
        <span
          key={item.label}
          className={`mp-ticker__item${item.tone === 'critical' ? ' mp-ticker__item--critical' : ''}`}
        >
          <span className="mp-ticker__label">{item.label}</span>
          <span className="mp-ticker__value">{item.value}</span>
        </span>
      ))}

      {criticalOrders.map((order) => (
        <span key={order.id} className="mp-ticker__item mp-ticker__item--alert">
          <span className="mp-ticker__label">Kritik</span>
          <span className="mp-ticker__value">
            {order.customer?.trim() || 'Müşteri belirtilmemiş'} · {order.orderNo}
          </span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mp-ticker" slot={slot} data-hide-order="10">
      <div className="mp-ticker__track">
        {group}
        <div aria-hidden="true" style={{ display: 'contents' }}>
          {group}
        </div>
      </div>
    </div>
  );
}
