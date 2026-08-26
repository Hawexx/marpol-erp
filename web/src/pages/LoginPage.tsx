import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input, Label, MessageStrip } from '@ui5/webcomponents-react';
import { useAuth } from '../auth/AuthContext.js';
import { errorMessage } from '../api/client.js';

/** Giris ekraninda oynatilan tanitim videosunun hizi. */
const INTRO_SPEED = 2.5;

const INTRO_SEEN_KEY = 'marpol.ppm.introSeen';

/**
 * Tanitim videosu (2,4 MB) daha once izlendi mi?
 *
 * Onceden video her giris ekraninda oynuyordu; oturum suresi dolup kullanici
 * giris ekranina dustugunde de bastan basliyordu. Ozel pencerede ya da site
 * verisi engelliyse okuma hata firlatabilir, bu yuzden sarmalanir.
 */
function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* depolama yoksa video her seferinde oynar; islevsel bir kayip degil */
  }
}

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [introDone, setIntroDone] = useState(introSeen);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mp-login">
      {!introDone && (
        <IntroVideo
          onFinish={() => {
            markIntroSeen();
            setIntroDone(true);
          }}
        />
      )}

      <form className="mp-login__panel" onSubmit={submit}>
        <img className="mp-login__logo" src="/marpol.svg" alt="Marpol" />
        <h1 className="mp-login__title">Üretim Yönetim Sistemi</h1>
        <p className="mp-login__sub">Devam etmek için kurumsal hesabınızla giriş yapın.</p>

        {error && (
          <div style={{ marginBottom: '1rem' }}>
            <MessageStrip design="Negative" hideCloseButton>
              {error}
            </MessageStrip>
          </div>
        )}

        <div style={{ marginBottom: '0.875rem' }}>
          <Label for="username" required showColon>
            Kullanıcı Adı
          </Label>
          <Input
            id="username"
            style={{ width: '100%' }}
            value={username}
            onInput={(e) => setUsername(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <Label for="password" required showColon>
            Şifre
          </Label>
          <Input
            id="password"
            type="Password"
            style={{ width: '100%' }}
            value={password}
            onInput={(e) => setPassword(e.target.value)}
          />
        </div>

        <Button
          design="Emphasized"
          style={{ width: '100%' }}
          onClick={() => submit()}
          disabled={busy || !username || !password}
        >
          {busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
        </Button>
        {/* Enter tusuyla gonderim icin gizli submit */}
        <button type="submit" style={{ display: 'none' }} aria-hidden="true" />

        <div className="mp-login__footer">
          Marpol A.Ş. &middot; Üretim Yönetim Sistemi v1.0
        </div>
      </form>
    </div>
  );
}

/**
 * Giris paneline gelindiginde tam ekran oynayan tanitim videosu.
 * Bitince (ya da atlanınca) kaybolur ve giris formu gorunur.
 */
function IntroVideo({ onFinish }: { onFinish: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [closing, setClosing] = useState(false);

  // Kapanis animasyonunu bekleyip formu goster.
  function finish() {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onFinish, 450);
  }

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // playbackRate her yuklemede sifirlanir; metadata gelince yeniden uygulanir.
    const applySpeed = () => {
      video.playbackRate = INTRO_SPEED;
    };
    applySpeed();
    video.addEventListener('loadedmetadata', applySpeed);

    // Tarayici otomatik oynatmayi engellerse videoyu bekletmeden gec.
    video.play().catch(() => finish());

    return () => video.removeEventListener('loadedmetadata', applySpeed);
    // finish/onFinish kimlikleri degisse de efektin tekrar calismasi istenmiyor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`mp-intro${closing ? ' mp-intro--closing' : ''}`}
      onClick={finish}
      role="presentation"
    >
      <video
        ref={videoRef}
        className="mp-intro__video"
        src="/marpol_giris.mp4"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finish}
        onError={finish}
      />
      <button
        type="button"
        className="mp-intro__skip"
        onClick={(e) => {
          e.stopPropagation();
          finish();
        }}
      >
        Geç &rsaquo;
      </button>
    </div>
  );
}
