import { useRef, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { CodeInput } from './CodeInput';
import { Icon } from './Icon';
import type { RedeemResult } from '../types';

interface Props {
  firstName: string;
  onRedeemed: (r: RedeemResult) => void;
}

type Result = { ok: boolean; msg: string; retry?: boolean };

export function CodeEntry({ firstName, onRedeemed }: Props) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) {
      setResult({ ok: false, msg: 'Kod 6 rakamdan oluşmalı.' });
      return;
    }
    setBusy(true);
    try {
      const r = await api.redeem(code);
      setResult({ ok: true, msg: r.message });
      setCode('');
      onRedeemed(r);
    } catch (err) {
      const e2 = err instanceof ApiError ? err : null;
      // Bağlantı hatasında kodu silmiyoruz; tek dokunuşla tekrar denenebilsin
      const retry = !e2 || e2.code === 'NETWORK' || e2.status >= 500;
      setResult({ ok: false, msg: e2?.message || 'Bir sorun oluştu, tekrar dene.', retry });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="card code-card">
      <p className="eyebrow">Kod gir</p>
      <h2>Merhaba {firstName}</h2>
      <p className="sub">Stanttan, oturumdan ya da görevliden aldığın 6 haneli kodu yaz. Hangi göreve ait olduğunu sistem bulur.</p>
      <form className="code-row" onSubmit={submit} autoComplete="off">
        <CodeInput
          ref={inputRef}
          id="code"
          value={code}
          onChange={(v) => {
            setCode(v);
            if (result && !result.retry) setResult(null);
          }}
          disabled={busy}
        />
        <button className="btn btn-gold" type="submit" disabled={busy}>
          {busy ? 'Kontrol ediliyor…' : 'Kodu kullan'}
        </button>
      </form>
      <div aria-live="polite">
        {result && (
          <div className={`result ${result.ok ? 'ok' : 'err'}`}>
            <Icon name={result.ok ? 'check' : 'alert'} />
            <span>{result.msg}</span>
            {result.retry && (
              <button type="button" className="btn btn-sm btn-red" onClick={() => void submit()} disabled={busy}>
                Tekrar dene
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
