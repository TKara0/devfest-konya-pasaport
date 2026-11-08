import { useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError } from '../api';
import { isGmail, logOut, sendLoginLink } from '../firebase';
import type { Me } from '../types';

export type AuthTab = 'giris' | 'kayit';

interface RegisterForm {
  firstName: string;
  lastName: string;
  phone: string;
  kvkk: boolean;
}

const EMAIL_ERR = 'Kişisel Gmail adresini yaz (ornek@gmail.com). Öğrenci ya da kurum e-postası kabul edilmiyor.';

function linkError(e: unknown) {
  if (e instanceof ApiError) return e.message;
  const code = (e as { code?: string }).code || '';
  if (code === 'auth/quota-exceeded') return 'Şu an çok fazla giriş bağlantısı istendi. Birkaç dakika sonra tekrar dene ya da bir görevliye başvur.';
  if (code === 'auth/operation-not-allowed') return 'Gmail bağlantısıyla giriş henüz açılmamış. Bir görevliye başvur.';
  return 'Bağlantı gönderilemedi. İnternetini kontrol edip tekrar dene.';
}

interface Props {
  /** Başlığın altında gösterilen etkinlik akışı kartı */
  nowCard?: ReactNode;
  /** Bağlantıyla giriş yapılmış ama pasaportu olmayan kullanıcının Gmail adresi */
  signedInEmail?: string | null;
  initialTab?: AuthTab;
  notice?: string;
  onRegistered: (me: Me) => void;
}

export function AuthScreen({ nowCard, signedInEmail, initialTab = 'giris', notice, onRegistered }: Props) {
  const [tab, setTab] = useState<AuthTab>(signedInEmail ? 'kayit' : initialTab);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const pick = (t: AuthTab) => {
    setTab(t);
    setSentTo(null);
  };

  return (
    <div className="auth">
      <div>
        <p className="eyebrow">21 Kasım · Sultan Alparslan Kongre Merkezi</p>
        <h1>Pasaportunu al, kodları topla, çekilişe gir.</h1>
        <p className="sub">Stantlardaki, oturumlardaki ve görevlerdeki 6 haneli kodları gir. Her kod çekiliş hakkına dönüşür.</p>
      </div>

      {nowCard}

      <div className="card auth-card">
        <div className="tabs" role="tablist" aria-label="Giriş ya da kayıt">
          <button type="button" role="tab" id="tab-giris" aria-selected={tab === 'giris'} aria-controls="panel-giris" onClick={() => pick('giris')}>
            Giriş yap
          </button>
          <button type="button" role="tab" id="tab-kayit" aria-selected={tab === 'kayit'} aria-controls="panel-kayit" onClick={() => pick('kayit')}>
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
          <LoginPanel signedInEmail={signedInEmail} onSwitch={() => pick('kayit')} onSent={setSentTo} />
        ) : (
          <RegisterPanel signedInEmail={signedInEmail} onRegistered={onRegistered} onSent={setSentTo} />
        )}
      </div>
    </div>
  );
}

function LoginPanel({ signedInEmail, onSwitch, onSent }: { signedInEmail?: string | null; onSwitch: () => void; onSent: (e: string) => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = email.trim().toLowerCase();
    if (!isGmail(m)) return setError(EMAIL_ERR);
    setError('');
    setBusy(true);
    try {
      await sendLoginLink(m);
      onSent(m);
    } catch (err) {
      setError(linkError(err));
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
          Başka bir Gmail adresi kullan
        </button>
      </div>
    );
  }

  return (
    <form id="panel-giris" role="tabpanel" aria-labelledby="tab-giris" className="panel form" onSubmit={submit} noValidate>
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
        <span className="hint">Şifre yok. Bu adrese tek dokunuşla giriş bağlantısı göndeririz.</span>
      </div>
      {error && <p className="err-text">{error}</p>}
      <button className="btn btn-red" type="submit" disabled={busy}>
        {busy ? 'Gönderiliyor…' : 'Giriş yap'}
      </button>
      <p className="hint-line">Kayıt olurken yazdığın Gmail ile gir; tüm kodların ve çekiliş hakların geri gelir.</p>
      {import.meta.env.VITE_DEMO === 'true' && (
        <div className="demo-accounts">
          <b>Demo hesapları</b> (tıkla, adres yazılsın):
          {['katilimci.demo@gmail.com', 'gorevli.demo@gmail.com', 'yonetici.demo@gmail.com'].map((m) => (
            <button key={m} type="button" onClick={() => setEmail(m)}>
              {m}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

function RegisterPanel({ signedInEmail, onRegistered, onSent }: { signedInEmail?: string | null; onRegistered: (me: Me) => void; onSent: (e: string) => void }) {
  const [form, setForm] = useState<RegisterForm>({ firstName: '', lastName: '', phone: '', kvkk: false });
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof RegisterForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function check(): string {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Ad ve soyad gerekli.';
    if (!signedInEmail && !isGmail(email.trim())) return EMAIL_ERR;
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
        onRegistered(await api.register(form));
      } else {
        // Bilgiler sunucuda beklesin; bağlantı hangi tarayıcıda açılırsa açılsın kayıt tamamlanır
        const addr = email.trim().toLowerCase();
        await api.registerIntent({ ...form, email: addr });
        await sendLoginLink(addr);
        onSent(addr);
      }
    } catch (err) {
      setError(linkError(err));
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
            Başka bir Gmail adresi kullan
          </button>
        </>
      ) : (
        <button className="btn btn-red" type="submit" disabled={busy}>
          {busy ? 'Gönderiliyor…' : 'Kayıt ol'}
        </button>
      )}
    </form>
  );
}

function LinkSent({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="panel sent" role="status">
      <h3>Gmail’ini kontrol et</h3>
      <p>
        <b>{email}</b> adresine giriş bağlantısı gönderdik. Gmail’i aç ve bağlantıya dokun; pasaportun açılır.
      </p>
      <p className="hint-line">Gelmediyse “Spam” ya da “Promosyonlar” klasörüne bak. Birkaç dakika içinde gelmezse Geri dön’e basıp tekrar iste.</p>
      <button type="button" className="btn btn-ghost wide" onClick={onBack}>
        Geri dön
      </button>
    </div>
  );
}
