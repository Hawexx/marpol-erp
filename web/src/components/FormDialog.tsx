import type { CSSProperties, ReactElement, ReactNode } from "react";
import { Bar, Button, Dialog } from "@ui5/webcomponents-react";

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
  saveLabel = "Kaydet",
  cancelLabel = "Vazgeç",
  /** Altbilginin soluna eklenecek serbest icerik (ornegin durum rozeti). */
  footerStart,
  width = "min(680px, 85vw)",
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
  width?: CSSProperties["minWidth"];
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
                {busy ? "Kaydediliyor..." : saveLabel}
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ minWidth: width, padding: "0.5rem 0" }}>{children}</div>
    </Dialog>
  );
}
