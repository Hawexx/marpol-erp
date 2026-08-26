import { Suspense, lazy } from 'react';
import type { ReactNode } from 'react';
import { BusyIndicator } from '@ui5/webcomponents-react';

/**
 * Bos / yukleniyor / hata ekranlari ve mesaj seritleri.
 *
 * GORSEL BOYUTU: IllustratedMessage gorselleri buyuk SVG verileridir ve
 * yalnizca `NoData` (~6 KB) ile `BeforeSearch` bilesenin kendisiyle gelir;
 * digerleri ayrica import edilmezse ekranda gorsel HIC gorunmez (sessiz hata).
 * Bu yuzden asagidaki ekranlar illustrations.js'i dinamik olarak cagirir.
 *
 * `NoSearchResults` BILEREK kullanilmiyor: tek basina ~226 KB. Filtre sonucu
 * bos durumu zaten tablonun `noDataText` metniyle anlatiliyor (asagida).
 *
 * URETEC NOTU: scripts/icons.mjs gorsel adlarini kaynak metninden duz dizge
 * olarak okur. `name` DAIMA tirnak icinde sabit yazilmali; degiskene
 * baglanirsa uretec goremez ve gorsel yine sessizce kaybolur.
 */

/*
 * Gorselli ekranlar ayri bir modulde ve React.lazy ile getiriliyor.
 * Sebep: gorsel verisi (~130 KB) yalnizca bu ekranlardan biri cizilecegi
 * zaman inmeli, AMA cizildigi anda yukleyicinin kayitli olmasi da sart.
 * Dinamik import'u useEffect icinde yapmak bu iki sarti ayni anda saglamaz;
 * efekt render'dan sonra calistigi icin ilk cizimde gorsel yukleyicisi
 * henuz kayitli olmuyor ve UI5 "No loader registered" hatasi firlatiyordu.
 */
const IllustratedState = lazy(() => import('./IllustratedState.js'));

/** Yuklenirken yer tutar; .mp-state min-height tasidigi icin ziplama olmaz. */
function StatePlaceholder() {
  return <div className="mp-state" />;
}

/** Hic kayit yokken gosterilir. */
export function EmptyState({
  title = 'Henüz kayıt yok',
  description,
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <Suspense fallback={<StatePlaceholder />}>
      <IllustratedState kind="empty" title={title} description={description} action={action} />
    </Suspense>
  );
}

/** Istek basarisiz olduğunda gosterilir. Bos listeden AYRI bir durumdur. */
export function ErrorState({
  title = 'Veriler yüklenemedi',
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <Suspense fallback={<StatePlaceholder />}>
      <IllustratedState kind="error" title={title} description={description} onRetry={onRetry} />
    </Suspense>
  );
}

export function LoadingState({ text = 'Yükleniyor...' }: { text?: string }) {
  return (
    <div className="mp-state">
      <BusyIndicator active text={text} />
    </div>
  );
}

/**
 * Tablolarin bos alan metni.
 *
 * AnalyticalTable'in `noDataText` prop'u ReactNode DEGIL duz `string`
 * kabul eder; tablonun bos alanina IllustratedMessage konamaz. Bu yuzden
 * tablo yerinde kalir ve uc durum icin uc farkli METIN doner - kullanici
 * "hic kayit yok" ile "filtre sonuc vermedi" ve "istek basarisiz" arasindaki
 * farki gorebilsin.
 */
export function tableEmptyText({
  isError,
  filtered,
  empty = 'Kayıtlı kayıt bulunamadı.',
  noResults = 'Bu filtrelerle sonuç bulunamadı.',
  error = 'Kayıtlar yüklenemedi.',
}: {
  isError?: boolean;
  filtered?: boolean;
  empty?: string;
  noResults?: string;
  error?: string;
}): string {
  if (isError) return error;
  return filtered ? noResults : empty;
}
