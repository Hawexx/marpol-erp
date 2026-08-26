import type { ReactNode } from 'react';
import { Button, IllustratedMessage } from '@ui5/webcomponents-react';
// STATIK import: bu modul yuklendiginde gorsel yukleyicileri de kayitli olur.
// Modulun kendisi React.lazy ile getirildigi icin gorsel verisi yine yalnizca
// bu ekranlardan biri cizilecegi zaman indirilir.
import '../illustrations.js';

/**
 * Gorselli bos/hata ekrani.
 *
 * NEDEN AYRI BIR MODUL: onceki surumde gorsel `useEffect` icinde dinamik
 * import ediliyor, IllustratedMessage ise ILK render'da ciziliyordu. Efekt
 * render'dan sonra calistigi icin bilesen, yukleyici daha kayitli degilken
 * gorseli istiyordu ve UI5 su hatayi firlatiyordu:
 *   "No loader registered for the fiori/NoData illustration."
 * Sonuc: konsolda yakalanmamis promise hatasi ve ekranda gorsel yok.
 *
 * Bu modul gorseli STATIK import ettigi ve kendisi React.lazy ile
 * getirildigi icin, cizildigi anda yukleyici kesinlikle hazirdir.
 *
 * URETEC NOTU: scripts/icons.mjs gorsel adlarini duz dizge olarak okur,
 * bu yuzden `name` degiskene baglanmaz - her tur icin ayri bir dal yazilir.
 */
export type StateKind = 'empty' | 'error';

export default function IllustratedState({
  kind,
  title,
  description,
  action,
  onRetry,
}: {
  kind: StateKind;
  title: string;
  description?: string;
  action?: ReactNode;
  onRetry?: () => void;
}) {
  const govde = onRetry ? (
    <Button design="Emphasized" onClick={onRetry}>
      Tekrar Dene
    </Button>
  ) : (
    action
  );

  return (
    <div className="mp-state">
      {kind === 'empty' ? (
        <IllustratedMessage name="NoData" titleText={title} subtitleText={description}>
          {govde}
        </IllustratedMessage>
      ) : (
        <IllustratedMessage name="UnableToLoad" titleText={title} subtitleText={description}>
          {govde}
        </IllustratedMessage>
      )}
    </div>
  );
}
