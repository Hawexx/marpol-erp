import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { Bar, Button, Dialog } from '@ui5/webcomponents-react';

/**
 * Adlandirilmis pencere genislikleri.
 *
 * Projede sekiz ayri deger elle yazilmisti (420 / 520 / 560 / 640 / 760 /
 * 780 / 900 px), aralarinda anlamli bir fark yoktu. Uc kademe yeterli.
 *
 * Deger `min(..., 90vw)` seklinde: dar ekranda pencere ekrani tasmaz.
 */
const SIZES = {
  /** Tek sutunlu kisa formlar (stok hareketi, sayim). */
  sm: 'min(26rem, 90vw)',
  /** Iki sutunlu standart formlar. */
  md: 'min(42rem, 90vw)',
  /** Genis formlar (yetki matrisi, kumas tanimi). */
  lg: 'min(60rem, 90vw)',
} as const;

export type FormDialogSize = keyof typeof SIZES;

/**
 * Kaydet / Vazgec altbilgisi olan form penceresi.
 *
 * Ayni ~25 satirlik Dialog + Bar + iki buton kalibi bes ayri sayfada
 * kopyalanmisti; birinde yapilan degisiklik (ornegin kaydederken butonu
 * kilitlemek) digerlerine tasinmiyordu.
 */
export function FormDialog({
  headerText,
  onClose,
  onSave,
  saveDisabled = false,
  busy = false,
  saveLabel = 'Kaydet',
  cancelLabel = 'Vazgeç',
  /** Altbilginin soluna eklenecek serbest icerik (ornegin durum rozeti). */
  footerStart,
  size = 'md',
  /**
   * @deprecated `size` kullanin.
   *
   * ISIM TUZAGI: bu prop `width` degil `minWidth` uyguluyor - pencere en az
   * bu kadar genis olur ama icerik zorlarsa buyuyebilir. Davranis, bagli
   * cagrilar bozulmasin diye aynen korunuyor.
   */
  width,
  children,
}: {
  headerText: string;
  onClose: () => void;
  onSave: () => void;
  saveDisabled?: boolean;
  busy?: boolean;
  saveLabel?: string;
  cancelLabel?: string;
  footerStart?: ReactElement;
  size?: FormDialogSize;
  width?: CSSProperties['minWidth'];
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      headerText={headerText}
      onClose={onClose}
      footer={
        <Bar
          design="Footer"
          startContent={footerStart}
          endContent={
            <>
              <Button design="Transparent" disabled={busy} onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button
                design="Emphasized"
                disabled={saveDisabled || busy}
                onClick={onSave}
              >
                {busy ? 'Kaydediliyor...' : saveLabel}
              </Button>
            </>
          }
        />
      }
    >
      <div className="mp-dialog-body" style={{ minWidth: width ?? SIZES[size] }}>
        {children}
      </div>
    </Dialog>
  );
}
