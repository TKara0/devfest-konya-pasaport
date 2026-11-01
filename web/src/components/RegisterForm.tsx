import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { logOut } from '../firebase';
import type { Me } from '../types';

interface Props {
  email: string;
  defaultName: string;
  onDone: (me: Me) => void;
}

export function RegisterForm({ email, defaultName, onDone }: Props) {
  const [first, ...rest] = defaultName.trim().split(/\s+/);
  const [form, setForm] = useState({
    username: '',
    firstName: first || '',
    lastName: rest.join(' '),
    phone: '',
    kvkk: false,
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  function localCheck(): string {
    if (!/^[a-z0-9._]{3,20}$/.test(form.username.trim().toLowerCase()))
      return 'Kullanıcı adı 3-20 karakter olmalı; harf, rakam, nokta ve alt çizgi kullanabilirsin.';
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Ad ve soyad gerekli.';
    const d = form.phone.replace(/\D/g, '');
    if (!/^(90)?0?5\d{9}$/.test(d)) return 'Telefonu 05xx xxx xx xx biçiminde yaz.';
    if (!form.kvkk) return 'Devam etmek için aydınlatma metnini onaylaman gerekiyor.';
    return '';
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const m = localCheck();
    setError(m);
    if (m) return;
    setBusy(true);
    try {
      onDone(await api.register({ ...form, username: form.username.trim().toLowerCase() }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kayıt tamamlanamadı, tekrar dene.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <div>
        <p className="eyebrow">Son adım</p>
        <h1>Pasaportunu oluştur</h1>
      </div>
      <div className="card">
        <div className="linked">
          <span className="dot" />
          <span>
            <b>{email}</b> ile giriş yaptın
          </span>
        </div>
        <form className="form" onSubmit={submit} noValidate>
          <div className="field">
            <label htmlFor="username">Kullanıcı adı</label>
            <input id="username" autoComplete="username" autoCapitalize="none" placeholder="ornek.kullanici" value={form.username} onChange={set('username')} />
            <span className="hint">Sıralamada bu ad görünür.</span>
          </div>
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
            <label htmlFor="phone">Telefon</label>
            <input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05xx xxx xx xx" value={form.phone} onChange={set('phone')} />
            <span className="hint">Çekilişi kazanırsan sana bu numaradan ulaşırız.</span>
          </div>
          <label className="check">
            <input id="kvkk" type="checkbox" checked={form.kvkk} onChange={set('kvkk')} />
            <span>
              <a href="/kvkk.html" target="_blank" rel="noreferrer">Aydınlatma metnini</a> okudum, bilgilerimin çekiliş için
              kullanılmasını onaylıyorum.
            </span>
          </label>
          {error && <p className="err-text">{error}</p>}
          <button className="btn btn-red" type="submit" disabled={busy}>
            {busy ? 'Kaydediliyor…' : 'Pasaportumu oluştur'}
          </button>
          <button className="btn btn-link" type="button" onClick={() => void logOut()}>
            Başka bir Gmail hesabı kullan
          </button>
        </form>
      </div>
    </div>
  );
}
