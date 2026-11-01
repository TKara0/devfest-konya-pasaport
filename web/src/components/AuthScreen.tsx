import { useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { api, ApiError } from '../api';
import { isInAppBrowser, logOut, signInWithGoogle } from '../firebase';
import type { Me } from '../types';

export type AuthTab = 'giris' | 'kayit';

export interface RegisterDraft {
  firstName: string;
  lastName: string;
  phone: string;
  kvkk: boolean;
}

const DRAFT_KEY = 'pasaport-kayit';

/** Google penceresi açılıp kapanırken (ya da yönlendirmeli girişte) form kaybolmasın diye saklanır. */
export const pendingDraft = {
  save(d: RegisterDraft) {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* gizli sekme */ }
  },
  take(): RegisterDraft | null {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      sessionStorage.removeItem(DRAFT_KEY);
      return raw ? (JSON.parse(raw) as RegisterDraft) : null;
    } catch {
      return null;
    }
  },
  clear() {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* yok say */ }
  },
};

interface Props {
  /** Google ile giriş yapılmış ama pasaportu olmayan kullanıcının Gmail adresi */
  signedInEmail?: string | null;
  signedInName?: string;
  initialTab?: AuthTab;
  notice?: string;
  onRegistered: (me: Me) => void;
}

export function AuthScreen({ signedInEmail, signedInName = '', initialTab = 'giris', notice, onRegistered }: Props) {
  const [tab, setTab] = useState<AuthTab>(signedInEmail ? 'kayit' : initialTab);
  const inApp = isInAppBrowser();

  return (
    <div className="auth">
      <div>
        <p className="eyebrow">21 Kasım · Sultan Alparslan Kongre Merkezi</p>
        <h1>Pasaportunu al, kodları topla, çekilişe gir.</h1>
        <p className="sub">Stantlardaki, oturumlardaki ve görevlerdeki 6 haneli kodları gir. Her kod çekiliş hakkına dönüşür.</p>
      </div>

      {inApp && <InAppWarning />}

      <div className="card auth-card">
        <div className="tabs" role="tablist" aria-label="Giriş ya da kayıt">
          <button type="button" role="tab" id="tab-giris" aria-selected={tab === 'giris'} aria-controls="panel-giris" onClick={() => setTab('giris')}>
            Giriş yap
          </button>
          <button type="button" role="tab" id="tab-kayit" aria-selected={tab === 'kayit'} aria-controls="panel-kayit" onClick={() => setTab('kayit')}>
            Kayıt ol
          </button>
        </div>

        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}

        {tab === 'giris' ? (
          <LoginPanel signedInEmail={signedInEmail} onSwitch={() => setTab('kayit')} />
        ) : (
          <RegisterPanel signedInEmail={signedInEmail} signedInName={signedInName} onRegistered={onRegistered} />
        )}
      </div>
    </div>
  );
}

function LoginPanel({ signedInEmail, onSwitch }: { signedInEmail?: string | null; onSwitch: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function go() {
    setError('');
    setBusy(true);
    pendingDraft.clear();
    try {
      await signInWithGoogle();
    } catch {
      setError('Google girişi tamamlanamadı. Sayfayı Chrome ya da Safari’de açıp tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="panel-giris" role="tabpanel" aria-labelledby="tab-giris" className="panel">
      <p className="sub small">
        Kayıt olurken kullandığın <b>Gmail</b> hesabıyla giriş yap. Şifre yok; tüm kodların ve çekiliş hakların geri gelir.
      </p>
      {signedInEmail ? (
        <div className="linked warn-linked">
          <span>
            <b>{signedInEmail}</b> ile kayıtlı pasaport yok.
          </span>
          <button type="button" className="btn-link inline" onClick={onSwitch}>
            Kayıt ol
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-google wide" onClick={go} disabled={busy}>
          <Icon name="google" />
          {busy ? 'Bekleniyor…' : 'Gmail ile giriş yap'}
        </button>
      )}
      {signedInEmail && (
        <button type="button" className="btn btn-ghost wide" onClick={() => void logOut()}>
          Başka bir Gmail hesabı kullan
        </button>
      )}
      {error && <p className="err-text">{error}</p>}
      <p className="hint-line">Öğrenci ya da kurum e-postası değil, kişisel Gmail adresin kullanılır.</p>
    </div>
  );
}

function RegisterPanel({ signedInEmail, signedInName, onRegistered }: { signedInEmail?: string | null; signedInName: string; onRegistered: (me: Me) => void }) {
  const [first, ...rest] = signedInName.trim().split(/\s+/);
  const [form, setForm] = useState<RegisterDraft>({ firstName: first || '', lastName: rest.join(' '), phone: '', kvkk: false });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof RegisterDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function check(): string {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Ad ve soyad gerekli.';
    const d = form.phone.replace(/\D/g, '');
    if (d && !/^(90)?0?5\d{9}$/.test(d)) return 'Telefonu 05xx xxx xx xx biçiminde yaz ya da boş bırak.';
    if (!form.kvkk) return 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.';
    return '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = check();
    setError(m);
    if (m) return;
    setBusy(true);
    try {
      if (signedInEmail) {
        // Google ile zaten giriş yapılmış: doğrudan kaydı tamamla
        onRegistered(await api.register(form));
      } else {
        // Önce Gmail doğrulaması; dönüşte App kaydı bu taslakla tamamlar
        pendingDraft.save(form);
        await signInWithGoogle();
      }
    } catch (err) {
      pendingDraft.clear();
      setError(err instanceof ApiError ? err.message : 'Kayıt tamamlanamadı. Sayfayı Chrome ya da Safari’de açıp tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form id="panel-kayit" role="tabpanel" aria-labelledby="tab-kayit" className="panel form" onSubmit={submit} noValidate>
      <div className="row2">
        <div className="field">
          <label htmlFor="firstName">Ad</label>
          <input id="firstName" autoComplete="given-name" value={form.firstName} onChange={set('firstName')} />
        </div>
        <div className="field">
          <label htmlFor="lastName">Soyad</label>
          <input id="lastName" autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
        </div>
      </div>

      <div className="field">
        <label htmlFor="gmail">Gmail</label>
        {signedInEmail ? (
          <input id="gmail" value={signedInEmail} readOnly className="readonly" />
        ) : (
          <div id="gmail" className="gmail-slot">
            <Icon name="google" />
            <span>“Gmail ile kayıt ol” dediğinde Google hesabından alınır</span>
          </div>
        )}
        <span className="hint">Pasaportun bu Gmail adresine bağlanır. Öğrenci ya da kurum e-postası kabul edilmez.</span>
      </div>

      <div className="field">
        <label htmlFor="phone">
          Telefon <span className="optional">isteğe bağlı</span>
        </label>
        <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" value={form.phone} onChange={set('phone')} />
        <span className="hint">Çekilişi kazanırsan sana daha hızlı ulaşabilmemiz için.</span>
      </div>

      <label className="check">
        <input id="kvkk" type="checkbox" checked={form.kvkk} onChange={set('kvkk')} />
        <span>
          <a href="/kvkk.html" target="_blank" rel="noreferrer">
            Aydınlatma metnini
          </a>{' '}
          okudum, bilgilerimin çekiliş için kullanılmasını onaylıyorum.
        </span>
      </label>

      {error && <p className="err-text">{error}</p>}

      {signedInEmail ? (
        <>
          <button className="btn btn-red" type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Kaydı tamamla'}
          </button>
          <button className="btn-link" type="button" onClick={() => void logOut()}>
            Başka bir Gmail hesabı kullan
          </button>
        </>
      ) : (
        <button className="btn btn-google" type="submit" disabled={busy}>
          <Icon name="google" />
          {busy ? 'Bekleniyor…' : 'Gmail ile kayıt ol'}
        </button>
      )}
    </form>
  );
}

function InAppWarning() {
  const [copied, setCopied] = useState(false);
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="card warn">
      <h3>Bu sayfayı tarayıcıda aç</h3>
      <p>
        Instagram, LinkedIn gibi uygulamaların içinden Google ile giriş yapılamıyor. Sağ üstteki menüden “Tarayıcıda aç”
        seçeneğine dokun ya da bağlantıyı kopyalayıp Chrome/Safari’ye yapıştır.
      </p>
      <div className="copy-row">
        <code>{window.location.host}</code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={copyLink}>
          {copied ? 'Kopyalandı' : 'Bağlantıyı kopyala'}
        </button>
      </div>
    </div>
  );
}

