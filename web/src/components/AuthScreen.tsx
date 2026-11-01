import { useState, type FormEvent } from 'react';
import { Icon } from './Icon';
import { api, ApiError } from '../api';
import { isGmail, isInAppBrowser, logOut, sendLoginLink, signInWithGoogle } from '../firebase';
import type { Me } from '../types';

export type AuthTab = 'giris' | 'kayit';

export interface RegisterDraft {
  firstName: string;
  lastName: string;
  phone: string;
  kvkk: boolean;
}

const DRAFT_KEY = 'pasaport-kayit';
const DRAFT_TTL = 24 * 60 * 60 * 1000;

/**
 * Kayıt formu, Google penceresi ya da Gmail'deki bağlantı açılırken kaybolmasın diye
 * bu cihazda saklanır (bağlantı yeni sekmede açılabileceği için localStorage).
 */
export const pendingDraft = {
  save(d: RegisterDraft) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, at: Date.now() })); } catch { /* gizli sekme */ }
  },
  take(): RegisterDraft | null {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      return Date.now() - (d.at || 0) < DRAFT_TTL ? d : null;
    } catch {
      return null;
    }
  },
  clear() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* yok say */ }
  },
};

const EMAIL_ERR = 'Kişisel Gmail adresini yaz (ornek@gmail.com). Öğrenci ya da kurum e-postası kabul edilmiyor.';
const linkError = (e: unknown) => {
  const code = (e as { code?: string }).code || '';
  if (code === 'auth/quota-exceeded') return 'Şu an çok fazla bağlantı istendi. Birkaç dakika sonra dene ya da Google ile giriş yap.';
  if (code === 'auth/operation-not-allowed') return 'Gmail bağlantısıyla giriş henüz açılmamış. Google ile giriş yap.';
  return 'Bağlantı gönderilemedi. İnternetini kontrol et ya da Google ile giriş yap.';
};

interface Props {
  /** Giriş yapılmış ama pasaportu olmayan kullanıcının Gmail adresi */
  signedInEmail?: string | null;
  signedInName?: string;
  initialTab?: AuthTab;
  notice?: string;
  onRegistered: (me: Me) => void;
}

export function AuthScreen({ signedInEmail, signedInName = '', initialTab = 'giris', notice, onRegistered }: Props) {
  const [tab, setTab] = useState<AuthTab>(signedInEmail ? 'kayit' : initialTab);
  const [sentTo, setSentTo] = useState<string | null>(null);
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
          <button type="button" role="tab" id="tab-giris" aria-selected={tab === 'giris'} aria-controls="panel-giris" onClick={() => { setTab('giris'); setSentTo(null); }}>
            Giriş yap
          </button>
          <button type="button" role="tab" id="tab-kayit" aria-selected={tab === 'kayit'} aria-controls="panel-kayit" onClick={() => { setTab('kayit'); setSentTo(null); }}>
            Kayıt ol
          </button>
        </div>

        {notice && (
          <p className="notice" role="alert">
            {notice}
          </p>
        )}

        {sentTo ? (
          <LinkSent email={sentTo} onBack={() => setSentTo(null)} />
        ) : tab === 'giris' ? (
          <LoginPanel signedInEmail={signedInEmail} onSwitch={() => setTab('kayit')} onSent={setSentTo} />
        ) : (
          <RegisterPanel signedInEmail={signedInEmail} signedInName={signedInName} onRegistered={onRegistered} onSent={setSentTo} />
        )}
      </div>
    </div>
  );
}

function GoogleButton({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
  return (
    <button type="button" className="btn btn-google wide-tight" onClick={onClick} disabled={busy}>
      <Icon name="google" />
      {label}
    </button>
  );
}

function LoginPanel({ signedInEmail, onSwitch, onSent }: { signedInEmail?: string | null; onSwitch: () => void; onSent: (e: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendLink(e: FormEvent) {
    e.preventDefault();
    const m = email.trim().toLowerCase();
    if (!isGmail(m)) return setError(EMAIL_ERR);
    setError('');
    setBusy(true);
    pendingDraft.clear();
    try {
      await sendLoginLink(m);
      onSent(m);
    } catch (err) {
      setError(linkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
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

  if (signedInEmail) {
    return (
      <div id="panel-giris" role="tabpanel" aria-labelledby="tab-giris" className="panel">
        <div className="linked warn-linked">
          <span>
            <b>{signedInEmail}</b> ile kayıtlı pasaport yok.
          </span>
          <button type="button" className="btn-link inline" onClick={onSwitch}>
            Kayıt ol
          </button>
        </div>
        <button type="button" className="btn btn-ghost wide" onClick={() => void logOut()}>
          Başka bir Gmail hesabı kullan
        </button>
      </div>
    );
  }

  return (
    <div id="panel-giris" role="tabpanel" aria-labelledby="tab-giris" className="panel">
      <form className="form tight" onSubmit={sendLink} noValidate>
        <div className="field">
          <label htmlFor="login-email">Gmail adresin</label>
          <input
            id="login-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="ornek@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <span className="hint">Şifre yok. Bu adrese tek tıkla giriş bağlantısı göndeririz.</span>
        </div>
        <button className="btn btn-red" type="submit" disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Giriş yap'}
        </button>
      </form>

      <div className="or">veya</div>
      <GoogleButton label="Google ile giriş yap" onClick={google} busy={busy} />

      {error && <p className="err-text">{error}</p>}
      <p className="hint-line">Kayıt olurken kullandığın Gmail ile gir; tüm kodların ve çekiliş hakların geri gelir.</p>
    </div>
  );
}

function RegisterPanel({
  signedInEmail,
  signedInName,
  onRegistered,
  onSent,
}: {
  signedInEmail?: string | null;
  signedInName: string;
  onRegistered: (me: Me) => void;
  onSent: (e: string) => void;
}) {
  const [first, ...rest] = signedInName.trim().split(/\s+/);
  const [form, setForm] = useState<RegisterDraft>({ firstName: first || '', lastName: rest.join(' '), phone: '', kvkk: false });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof RegisterDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function checkForm(): string {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Ad ve soyad gerekli.';
    const d = form.phone.replace(/\D/g, '');
    if (d && !/^(90)?0?5\d{9}$/.test(d)) return 'Telefonu 05xx xxx xx xx biçiminde yaz ya da boş bırak.';
    if (!form.kvkk) return 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.';
    return '';
  }

  // Ana düğme: yazılan Gmail'e bağlantı gönder (ya da zaten girişliyse kaydı bitir)
  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = checkForm() || (!signedInEmail && !isGmail(email.trim()) ? EMAIL_ERR : '');
    setError(m);
    if (m) return;
    setBusy(true);
    try {
      if (signedInEmail) {
        onRegistered(await api.register(form));
      } else {
        const addr = email.trim().toLowerCase();
        pendingDraft.save(form);
        await sendLoginLink(addr);
        onSent(addr);
      }
    } catch (err) {
      if (!signedInEmail) pendingDraft.clear();
      setError(err instanceof ApiError ? err.message : linkError(err));
    } finally {
      setBusy(false);
    }
  }

  // Alternatif: Google hesabıyla kayıt (Gmail adresi Google'dan gelir)
  async function google() {
    const m = checkForm();
    setError(m);
    if (m) return;
    setBusy(true);
    try {
      pendingDraft.save(form);
      await signInWithGoogle();
    } catch {
      pendingDraft.clear();
      setError('Google girişi tamamlanamadı. Sayfayı Chrome ya da Safari’de açıp tekrar dene.');
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
          <input
            id="gmail"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            placeholder="ornek@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
        <span className="hint">Pasaportun bu adrese bağlanır. Öğrenci ya da kurum e-postası kabul edilmez.</span>
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
        <>
          <button className="btn btn-red" type="submit" disabled={busy}>
            {busy ? 'Gönderiliyor…' : 'Kayıt ol'}
          </button>
          <div className="or">veya</div>
          <GoogleButton label="Google ile kayıt ol" onClick={google} busy={busy} />
        </>
      )}
    </form>
  );
}

function LinkSent({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="panel sent" role="status">
      <h3>Gmail’ini kontrol et</h3>
      <p>
        <b>{email}</b> adresine giriş bağlantısı gönderdik. Bağlantıya <b>bu telefonda</b> dokun; pasaportun açılır.
      </p>
      <p className="hint-line">Gelmediyse “Spam” ya da “Promosyonlar” klasörüne bak.</p>
      <button type="button" className="btn btn-ghost wide" onClick={onBack}>
        Geri dön
      </button>
    </div>
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

