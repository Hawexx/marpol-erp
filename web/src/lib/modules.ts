import type { ModuleKey } from '../api/types.js';

/**
 * Yetki modullerinin tek kaynagi.
 *
 * Bu liste daha once dort ayri yerde tekrarlaniyordu: `types.ts` birlesim
 * tipi, `format.ts` etiket sozlugu, `UsersPage` yetki matrisi ve `App.tsx`
 * menusu. Yeni bir modul eklerken (DENETIM ve STOK'ta oldugu gibi) dordunu
 * de elle guncellemek gerekiyordu; biri atlanirsa modul yetki matrisinde
 * gorunmuyor ya da etiketsiz kaliyordu.
 *
 * `ModuleKey` tipi hala `types.ts` icinde: sunucu enum'unun aynasi oldugu
 * ve API tipleriyle birlikte durmasi gerektigi icin. Burasi ise o tipin
 * kullanici arayuzune bakan tarafini (siralama ve etiket) tanimlar.
 */
export interface ModuleDef {
  key: ModuleKey;
  /** Yetki matrisinde ve denetim kaydinda gorunen ad. */
  label: string;
  /** Modulun ne yaptigini anlatan kisa aciklama (yetki matrisi ipucu). */
  hint: string;
}

/** Sira, yetki matrisindeki satir sirasidir. */
export const MODULES: ModuleDef[] = [
  {
    key: 'URETIM_EMRI_OLUSTUR',
    label: 'Üretim Emri Oluşturma',
    hint: 'Yeni üretim emri açma ve mevcut emri düzenleme',
  },
  {
    key: 'URETIM_EMIRLERI',
    label: 'Üretim Emirleri',
    hint: 'Emirleri görüntüleme, durum ilerletme ve proses adımları',
  },
  { key: 'FLANS', label: 'Flanş Çeşitleri', hint: 'Flanş tanım kartları' },
  { key: 'KUMAS', label: 'Kumaş Çeşitleri', hint: 'Kumaş kartları ve kimyasalları' },
  { key: 'KIMYASAL_RECETE', label: 'Kimyasal Reçete', hint: 'Karışım reçeteleri' },
  {
    key: 'IS_AKISI',
    label: 'İş Akışı / Proses Şemaları',
    hint: 'Proses şemaları ve makine tanımları',
  },
  { key: 'STOK', label: 'Stok Takibi', hint: 'Kimyasal stok seviyeleri ve hareketleri' },
  {
    key: 'YETKILENDIRME',
    label: 'Yetkilendirme Paneli',
    hint: 'Personel hesapları ve yetkileri',
  },
  { key: 'DENETIM', label: 'Denetim Kaydı', hint: 'Sistemdeki işlemlerin kaydı' },
];

export const MODULE_KEYS: ModuleKey[] = MODULES.map((m) => m.key);

/**
 * Modul etiketleri. `Record<ModuleKey, string>` olarak tiplenir; boylece
 * yeni bir modul eklenip burada karsiligi verilmezse derleme hata verir.
 */
export const MODULE_LABEL = Object.fromEntries(
  MODULES.map((m) => [m.key, m.label]),
) as Record<ModuleKey, string>;
