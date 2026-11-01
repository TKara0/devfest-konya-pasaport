import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { CodeInput } from './CodeInput';
import { Icon } from './Icon';
import type { RotatingCode } from '../types';

export function Staff() {
  const [codes, setCodes] = useState<RotatingCode[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [sel, setSel] = useState(0);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setCodes(await api.staffCodes());
      setFetchedAt(Date.now());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Kodlar alınamadı.');
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [load]);

  const cur = codes?.[sel];
  const left = cur ? Math.max(0, cur.secondsLeft - Math.floor((now - fetchedAt) / 1000)) : 0;

  // Süre dolunca yeni kodu çek
  useEffect(() => {
    if (cur && left === 0) void load();
  }, [cur, left, load]);

  return (
    <section>
      <div className="section-head page-head">
        <div>
          <p className="eyebrow">Görevli ekranı</p>
          <h1>Dönen kodlar</h1>
          <p className="sub">Katılımcı paylaşımını gösterdiğinde bu kodu onun telefonundaki kod alanına sen yaz. Kodu sesli okuma, ekranı gösterme.</p>
        </div>
      </div>

      <div className="staff">
        <div className="card rot">
          {error && <p className="err-text light">{error}</p>}
          {codes && codes.length === 0 && <p>Dönen kodlu görev tanımlı değil.</p>}
          {codes && codes.length > 0 && cur && (
            <>
              {codes.length > 1 && (
                <div className="seg dark" role="group" aria-label="Görev seç">
                  {codes.map((c, i) => (
                    <button key={c.taskId} type="button" aria-pressed={i === sel} onClick={() => setSel(i)}>
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
              <p className="eyebrow">{cur.name}</p>
              <div className="rot-code">{cur.code}</div>
              <div className="rot-timer">
                <div className="bar">
                  <i style={{ width: `${(left / cur.periodSeconds) * 100}%` }} />
                </div>
                <p>
                  Yeni koda {Math.floor(left / 60)} dk {String(left % 60).padStart(2, '0')} sn
                </p>
              </div>
            </>
          )}
          {!codes && !error && <p>Yükleniyor…</p>}
        </div>

        <div className="col">
          <div className="card">
            <h2>Nasıl kontrol edilir?</h2>
            <ol className="steps">
              <li>Katılımcı paylaşımını kendi telefonundan gösterir.</li>
              <li>Paylaşımın herkese açık olduğunu ve DevFest Konya’yı etiketlediğini kontrol et.</li>
              <li>Katılımcının pasaportundaki kod alanına bu kodu yaz.</li>
              <li>Ekranda yeşil onay görünce işlem tamam.</li>
            </ol>
            <p className="note">Saat başında bir önceki kod 3 dakika daha kabul edilir. Sonrasında “süresi doldu” hatası verir.</p>
          </div>
          <StaffRedeem />
        </div>
      </div>
    </section>
  );
}

/** Telefonu kapanan ya da kod giremeyen katılımcı için görevlinin kendi ekranından kod girmesi. */
function StaffRedeem() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<{ ok: boolean; msg: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes('@') || code.length !== 6) {
      setRes({ ok: false, msg: 'Katılımcının Gmail adresini ve 6 haneli kodu gir.' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.staffRedeem(email.trim(), code);
      setRes({ ok: true, msg: `${r.user.firstName} ${r.user.lastName}: ${r.message}` });
      setCode('');
    } catch (err) {
      setRes({ ok: false, msg: err instanceof ApiError ? err.message : 'İşlem tamamlanamadı.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h2>Katılımcı adına kod gir</h2>
      <p className="sub small">Telefonu kapanan ya da internete bağlanamayan katılımcılar için. İşlem senin adınla kaydedilir.</p>
      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="staff-email">Katılımcının Gmail adresi</label>
          <input id="staff-email" type="email" inputMode="email" autoCapitalize="none" placeholder="ornek@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Kod</span>
          <CodeInput id="staff-code" tone="light" value={code} onChange={setCode} disabled={busy} />
        </div>
        <button type="submit" className="btn btn-red" disabled={busy}>
          {busy ? 'Kontrol ediliyor…' : 'Kodu işle'}
        </button>
        {res && (
          <div className={`result ${res.ok ? 'ok' : 'err bordered'}`}>
            <Icon name={res.ok ? 'check' : 'alert'} />
            <span>{res.msg}</span>
          </div>
        )}
      </form>
    </div>
  );
}
