/**
 * Etiket sozlukleri ve bicimlendirme yardimcilari.
 *
 * Bu modul bilerek UI kutuphanesinden bagimsiz tutulur; boylece hem
 * arayuzde hem de PDF uretiminde (ve testlerde) kullanilabilir.
 */
import type { OrderStatus, Priority, StepStatus } from '../api/types.js';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  TASLAK: 'Taslak',
  ONAY_BEKLIYOR: 'Onay Bekliyor',
  PLANLANDI: 'Planlandı',
  URETIMDE: 'Üretimde',
  BEKLEMEDE: 'Beklemede',
  TAMAMLANDI: 'Tamamlandı',
  IPTAL: 'İptal',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  DUSUK: 'Düşük',
  NORMAL: 'Normal',
  YUKSEK: 'Yüksek',
  KRITIK: 'Kritik',
};

export const STEP_LABEL: Record<StepStatus, string> = {
  BEKLIYOR: 'Bekliyor',
  BASLADI: 'Başladı',
  TAMAMLANDI: 'Tamamlandı',
  ATLANDI: 'Atlandı',
};

export const NODE_TYPE_LABEL: Record<string, string> = {
  START: 'Başlangıç',
  OPERATION: 'Operasyon',
  MACHINE: 'Makine',
  QUALITY: 'Kalite Kontrol',
  DECISION: 'Karar',
  WAIT: 'Bekleme / Kurutma',
  END: 'Bitiş',
};

export const MODULE_LABEL: Record<string, string> = {
  URETIM_EMRI_OLUSTUR: 'Üretim Emri Oluşturma',
  FLANS: 'Flanş Çeşitleri',
  KUMAS: 'Kumaş Çeşitleri',
  KIMYASAL_RECETE: 'Kimyasal Reçete',
  IS_AKISI: 'İş Akışı / Proses Şemaları',
  URETIM_EMIRLERI: 'Üretim Emirleri',
  YETKILENDIRME: 'Yetkilendirme Paneli',
  DENETIM: 'Denetim Kaydı',
  STOK: 'Stok Takibi',
};

/** Stok hareket sebepleri. */
export const STOCK_REASON_LABEL: Record<string, string> = {
  GIRIS: 'Mal Kabul',
  CIKIS: 'Çıkış',
  URETIM: 'Üretim Tüketimi',
  SAYIM: 'Sayım Düzeltmesi',
  IADE: 'İade / Dönüş',
};

/** Denetim kaydindaki teknik eylem adlarinin Turkce karsiliklari. */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  CREATE: 'Oluşturma',
  UPDATE: 'Güncelleme',
  DELETE: 'Silme',
  DEACTIVATE: 'Pasife Alma',
  LOGIN: 'Giriş',
  LOGOUT: 'Çıkış',
  LOGIN_FAILED: 'Başarısız Giriş',
  LOGIN_LOCKED: 'Kilitli Hesap Denemesi',
  LOGIN_INACTIVE: 'Pasif Hesap Denemesi',
  CHANGE_PASSWORD: 'Şifre Değişimi',
  STATUS_CHANGE: 'Durum Değişimi',
  STEP_UPDATE: 'Proses Adımı',
};

/** Denetim kaydindaki varlik adlarinin Turkce karsiliklari. */
export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  User: 'Kullanıcı',
  ProductionOrder: 'Üretim Emri',
  Fabric: 'Kumaş',
  Flange: 'Flanş',
  Chemical: 'Kimyasal',
  Recipe: 'Reçete',
  Workflow: 'Proses Şeması',
  Machine: 'Makine',
};

export function formatDate(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value?: number | null, digits = 0): string {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Termine kalan gun sayisi (negatif ise gecikmis). */
/**
 * Termine kalan gun sayisi. Negatif deger gecikmeyi gosterir.
 *
 * Onceden ham zaman farki `Math.ceil` ile bolunuyordu. Terminler saat 12:00
 * olarak saklandigi icin bugun teslimli bir emir ogleden once "0 gun",
 * ogleden sonra ise gecikmis gorunuyordu; ayrica kucuk negatif farklarda
 * `Math.ceil` `-0` uretiyor ve `-0 < 0` false oldugu icin gecikme rozeti
 * hic cikmiyordu. Sunucudaki "termini gecen" sayaci ise kesin
 * karsilastirma yaptigindan KPI kutusu ile satir rozeti celisebiliyordu.
 * Cozum: iki tarafi da GUN BASINA normalize edip farki gun olarak almak.
 */
export function daysUntil(deadline: string): number {
  const target = new Date(deadline);
  const today = new Date();

  const targetDay = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const todayDay = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

  return Math.round((targetDay - todayDay) / 86_400_000);
}

/** <input type="date"> icin ISO tarih parcasi. */
export function toDateInput(value?: string | null): string {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

/**
 * dd.MM.yyyy -> yyyy-MM-dd. Sunucu tarih filtrelerinde ISO bicim bekler.
 * Takvimde bulunmayan tarihlerde (31.02 gibi) null doner.
 */
export function trToIsoDate(value: string): string | null {
  const m = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(y) || date.getMonth() + 1 !== Number(mo) || date.getDate() !== Number(d)) {
    return null;
  }
  return `${y}-${mo}-${d}`;
}
