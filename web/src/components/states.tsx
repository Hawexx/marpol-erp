import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { BusyIndicator, Button, IllustratedMessage } from '@ui5/webcomponents-react';

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

/** Gorsel verisini yalnizca bu ekranlar acildiginda indirir. */
function useIllustrationAssets() {
  useEffect(() => {
    void import('../illustrations.js');
  }, []);
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
  useIllustrationAssets();
  return (
    <div className="mp-state">
      <IllustratedMessage name="NoData" titleText={title} subtitleText={description}>
        {action}
      </IllustratedMessage>
    </div>
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
  useIllustrationAssets();
  return (
    <div className="mp-state">
      <IllustratedMessage name="UnableToLoad" titleText={title} subtitleText={description}>
        {onRetry && (
          <Button design="Emphasized" onClick={onRetry}>
            Tekrar Dene
          </Button>
        )}
      </IllustratedMessage>
    </div>
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
