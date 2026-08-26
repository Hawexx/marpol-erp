import { useState } from 'react';
import { Bar, Button, Dialog, Input, Label, MessageStrip } from '@ui5/webcomponents-react';
import { api, errorMessage } from '../api/client.js';
import { useNotify } from '../components/NotificationProvider.js';
import { useAuth } from '../auth/AuthContext.js';

export default function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const { toast } = useNotify();
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (next !== repeat) {
      setError('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }
    if (next === current) {
      setError('Yeni şifre mevcut şifreden farklı olmalıdır.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      // Sunucu sifre degisiminde tum oturumlari dusurur; mevcut token artik
      // gecersiz oldugu icin kullaniciyi dogrudan giris ekranina alalim.
      toast('Şifreniz güncellendi. Lütfen yeni şifrenizle tekrar giriş yapın.');
      onClose();
      logout();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open
      headerText="Şifre Değiştir"
      onClose={onClose}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button design="Transparent" onClick={onClose}>
                Vazgeç
              </Button>
              <Button
                design="Emphasized"
                onClick={submit}
                disabled={busy || !current || next.length < 8}
              >
                Kaydet
              </Button>
            </>
          }
        />
      }
    >
      <div style={{ display: 'grid', gap: '0.75rem', minWidth: '320px', padding: '0.5rem 0' }}>
        {error && (
          <MessageStrip design="Negative" hideCloseButton>
            {error}
          </MessageStrip>
        )}
        <div>
          <Label showColon required>
            Mevcut Şifre
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={current}
            onInput={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div>
          <Label showColon required>
            Yeni Şifre
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={next}
            onInput={(e) => setNext(e.target.value)}
          />
        </div>
        <div>
          <Label showColon required>
            Yeni Şifre (Tekrar)
          </Label>
          <Input
            type="Password"
            style={{ width: '100%' }}
            value={repeat}
            onInput={(e) => setRepeat(e.target.value)}
          />
        </div>
      </div>
    </Dialog>
  );
}
