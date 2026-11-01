import { useState } from 'react';
import { Icon } from './Icon';
import { isInAppBrowser, signInWithGoogle } from '../firebase';

export function Landing() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const inApp = isInAppBrowser();

  async function go() {
    setError('');
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch {
      setError('Google girişi tamamlanamadı. Sayfayı Chrome ya da Safari’de açıp tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="auth">
      <div>
        <p className="eyebrow">21 Kasım · Sultan Alparslan Kongre Merkezi</p>
        <h1>Pasaportunu al, kodları topla, çekilişe gir.</h1>
        <p className="sub">
          Stantlardaki, oturumlardaki ve görevlerdeki 6 haneli kodları gir. Her kod çekiliş hakkına dönüşür.
        </p>
      </div>

      {inApp && (
        <div className="card warn">
          <h3>Bu sayfayı tarayıcıda aç</h3>
          <p>
            Instagram, LinkedIn gibi uygulamaların içinden Google ile giriş yapılamıyor. Sağ üstteki menüden
            “Tarayıcıda aç” seçeneğine dokun ya da bağlantıyı kopyalayıp Chrome/Safari’ye yapıştır.
          </p>
          <div className="copy-row">
            <code>{window.location.host}</code>
            <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
              {copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <h2>Google ile devam et</h2>
        <p className="sub small">
          İlk kez geliyorsan kayıt formuna geçersin. Daha önce kayıt olduysan aynı Gmail hesabıyla giriş yap, tüm
          ilerlemen geri gelir.
        </p>
        <button type="button" className="btn btn-google wide" onClick={go} disabled={busy}>
          <Icon name="google" />
          {busy ? 'Bekleniyor…' : 'Gmail ile giriş yap'}
        </button>
        {error && <p className="err-text">{error}</p>}
      </div>
    </div>
  );
}
