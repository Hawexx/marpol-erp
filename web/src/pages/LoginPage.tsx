import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Input, InputIcon, Label, MessageStrip } from '@ui5/webcomponents-react';
import { useAppTheme } from '../theme/ThemeContext.js';
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
  // Hareket azaltma tercihi olan kullaniciya ve olculu veri modundaki
  // baglantiya 2,4 MB'lik video hic indirilmez.
  if (skipIntro()) return true;
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** Video hic oynatilmamali mi? */
function skipIntro(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    // Standart disi ama yaygin: kullanici "veri tasarrufu" acmissa.
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    return conn?.saveData === true;
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
  const { theme, toggleTheme } = useAppTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

      <div className="mp-login__card">
        {/* Marka tuvali; dar ekranda gizlenir. */}
        <aside className="mp-login__brand">
          <img className="mp-login__logo" src="/marpol.svg" alt="Marpol" />
          <p className="mp-login__brand-text">
            Kumaş hazırlıktan flanş montajına, üretim emirlerinin her adımını tek
            yerden izleyin.
          </p>
          <span className="mp-overline" style={{ color: 'inherit', opacity: 0.7 }}>
            Üretim Yönetim Sistemi
          </span>
        </aside>

        <form className="mp-login__panel" onSubmit={submit}>
          {/* Kullanici giris yapmadan da temayi secebilmeli: koyu tema
              kullanicisi eskiden beyaz bir kartla karsilaniyordu. */}
          <Button
            className="mp-login__theme"
            design="Transparent"
            icon={theme === 'dark' ? 'light-mode' : 'dark-mode'}
            tooltip={theme === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'}
            onClick={toggleTheme}
          />

          <h1 className="mp-login__title">Giriş yapın</h1>
          <p className="mp-login__sub">
            Devam etmek için kurumsal hesabınızla giriş yapın.
          </p>

          {error && (
            <MessageStrip design="Negative" hideCloseButton>
              {error}
            </MessageStrip>
          )}

          <div className="mp-login__field">
            <Label for="username" required showColon>
              Kullanıcı Adı
            </Label>
            <Input
              id="username"
              name="username"
              autoFocus
              accessibleName="Kullanıcı adı"
              style={{ width: '100%' }}
              value={username}
              onInput={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="mp-login__field">
            <Label for="password" required showColon>
              Şifre
            </Label>
            <Input
              id="password"
              name="password"
              type={showPassword ? 'Text' : 'Password'}
              accessibleName="Şifre"
              style={{ width: '100%' }}
              value={password}
              onInput={(e) => setPassword(e.target.value)}
            >
              <InputIcon
                slot="icon"
                name={showPassword ? 'hide' : 'show'}
                accessibleName={showPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                onClick={() => setShowPassword((v) => !v)}
              />
            </Input>
          </div>

          {/* type="Submit": Enter tusu formu gonderir, ayri bir gizli
              submit butonuna gerek kalmaz. */}
          <Button
            design="Emphasized"
            type="Submit"
            style={{ width: '100%' }}
            disabled={busy || !username || !password}
          >
            {busy ? 'Giriş yapılıyor...' : 'Giriş Yap'}
          </Button>

          <div className="mp-login__footer">
            Marpol A.Ş. &middot; Üretim Yönetim Sistemi v1.0
          </div>
        </form>
      </div>
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
