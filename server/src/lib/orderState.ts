import { OrderStatus, StepStatus } from '@prisma/client';

/**
 * Uretim emri ve proses adimi durum makineleri.
 *
 * Tanimlar rota dosyasindan buraya alindi ki test edilebilsinler ve tek
 * kaynaktan okunsunlar.
 *
 * NOT: Arayuzdeki `OrderListPage.ALLOWED` haritasi bunun bir kopyasidir ve
 * yalnizca hangi butonlarin gosterilecegini belirler. Kurali uygulayan taraf
 * her zaman sunucudur; kopya suruklenirse kullanici fazladan bir buton gorur,
 * gecis yine de reddedilir.
 */

/** Izin verilen emir durumu gecisleri. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.TASLAK]: [OrderStatus.ONAY_BEKLIYOR, OrderStatus.IPTAL],
  [OrderStatus.ONAY_BEKLIYOR]: [OrderStatus.PLANLANDI, OrderStatus.IPTAL],
  [OrderStatus.PLANLANDI]: [OrderStatus.URETIMDE, OrderStatus.BEKLEMEDE, OrderStatus.IPTAL],
  [OrderStatus.URETIMDE]: [OrderStatus.BEKLEMEDE, OrderStatus.TAMAMLANDI, OrderStatus.IPTAL],
  [OrderStatus.BEKLEMEDE]: [OrderStatus.URETIMDE, OrderStatus.IPTAL],
  [OrderStatus.TAMAMLANDI]: [],
  [OrderStatus.IPTAL]: [],
};

/**
 * Yalnizca `canApprove` yetkisi olanlarin yapabilecegi gecisler.
 * Bunlar "duzenleme" yetkisine birakilirsa saha operatoru de emir iptal
 * edebilir hale gelir.
 */
export const ONAY_GEREKTIREN_DURUMLAR = new Set<OrderStatus>([
  OrderStatus.PLANLANDI,
  OrderStatus.TAMAMLANDI,
  OrderStatus.IPTAL,
]);

/**
 * Adim durumu gecisleri.
 *
 * Ileri yonlu hareket kisitlanmaz: "Baslat"a basmadan isi bitiren bir
 * operatorun adimi dogrudan tamamlayabilmesi gerekir. Amac, anlamsiz GERIYE
 * donuslari engellemek (tamamlanmis bir adimi "bekliyor"a cevirip uretim
 * gecmisini gorunmez kilmak gibi).
 */
export const STEP_TRANSITIONS: Record<StepStatus, StepStatus[]> = {
  [StepStatus.BEKLIYOR]: [StepStatus.BASLADI, StepStatus.TAMAMLANDI, StepStatus.ATLANDI],
  [StepStatus.BASLADI]: [StepStatus.TAMAMLANDI, StepStatus.BEKLIYOR, StepStatus.ATLANDI],
  [StepStatus.TAMAMLANDI]: [StepStatus.BASLADI, StepStatus.ATLANDI],
  [StepStatus.ATLANDI]: [StepStatus.BEKLIYOR, StepStatus.BASLADI, StepStatus.TAMAMLANDI],
};

/** Emrin kapanmis (daha fazla islenmeyecek) durumlari. */
export const TERMINAL_DURUMLAR = new Set<OrderStatus>([
  OrderStatus.TAMAMLANDI,
  OrderStatus.IPTAL,
]);

/** Uretimi devam eden (kapanmamis) emir durumlari. */
export const ACIK_DURUMLAR: OrderStatus[] = Object.values(OrderStatus).filter(
  (s) => !TERMINAL_DURUMLAR.has(s),
);

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Ayni duruma gecis (degisiklik yok) her zaman serbesttir. */
export function canTransitionStep(from: StepStatus, to: StepStatus): boolean {
  return from === to || STEP_TRANSITIONS[from].includes(to);
}
