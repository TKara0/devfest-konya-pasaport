import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { fullName, type Draw, type DrawResult, type Raffle } from '../types';

const when = (ms: number) => new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', dateStyle: 'medium', timeStyle: 'short' });
const msg = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

/** Sayfa içi onay adımı: alert/confirm yerine düğme "Emin misin?" + Evet / Vazgeç'e dönüşür. */
function Confirm({ label, ask, yes, onConfirm, disabled }: { label: string; ask: string; yes: string; onConfirm: () => void; disabled?: boolean }) {
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(true)} disabled={disabled}>
        {label}
      </button>
    );
  }
  return (
    <span className="confirm" role="group" aria-label={ask}>
      <span>{ask}</span>
      <button
        type="button"
        className="btn btn-red btn-sm"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {yes}
      </button>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setArmed(false)}>
        Vazgeç
      </button>
    </span>
  );
}

function ResultRow({ r, index, active, busy, onSet }: { r: DrawResult; index: number; active: boolean; busy: boolean; onSet: (i: number, s: 'teslim edildi' | 'gelmedi') => void }) {
  // Kazanan: bekliyor → işaretlenebilir. Yedek: yalnızca kazanana geçtikten sonra.
  const pending = r.kind === 'kazanan' ? r.status === 'bekliyor' : r.status === 'yedekten kazanana geçti';
  const tone = r.status === 'teslim edildi' ? 'ok' : r.status === 'gelmedi' ? 'bad' : r.status === 'yedekten kazanana geçti' ? 'gold' : '';
  return (
    <li className="res">
      <div className="res-who">
        <b>
          {r.order}. {fullName(r)}
        </b>
        <span>
          {r.email}
          {r.phone ? ` · ${r.phone}` : ''} · şans {r.weight}
        </span>
      </div>
      <span className={`badge ${tone}`}>{r.kind === 'yedek' && r.status === 'bekliyor' ? 'sırada' : r.status}</span>
      {active && pending && (
        <span className="res-actions">
          <button type="button" className="btn btn-red btn-sm" disabled={busy} onClick={() => onSet(index, 'teslim edildi')}>
            Teslim edildi
          </button>
          <Confirm label="Gelmedi" ask="Elensin mi? Sıradaki yedek geçer." yes="Evet, gelmedi" disabled={busy} onConfirm={() => onSet(index, 'gelmedi')} />
        </span>
      )}
    </li>
  );
}

function DrawCard({ d, busy, onSet, onCancel }: { d: Draw; busy: boolean; onSet: (d: Draw, i: number, s: 'teslim edildi' | 'gelmedi') => void; onCancel: (d: Draw) => void }) {
  const active = d.status === 'aktif';
  const winners = d.results.map((r, i) => ({ r, i })).filter((x) => x.r.kind === 'kazanan');
  const backups = d.results.map((r, i) => ({ r, i })).filter((x) => x.r.kind === 'yedek');
  return (
    <article className={`draw${active ? '' : ' cancelled'}`}>
      <div className="draw-head">
        <div>
          <h3>
            {d.raffleName}
            {d.prize ? ` · ${d.prize}` : ''}
          </h3>
          <p className="small muted">
            {when(d.drawnAt)} · {d.drawnBy} · havuz {d.poolSize} kişi · {d.winnersDrawn} kazanan, {d.backupsDrawn} yedek
          </p>
        </div>
        {active ? (
          <Confirm label="Çekilişi iptal et" ask="Kazananlar havuza geri döner. Emin misin?" yes="Evet, iptal et" disabled={busy} onConfirm={() => onCancel(d)} />
        ) : (
          <span className="badge bad">iptal edildi</span>
        )}
      </div>
      <h4 className="res-title">Kazananlar</h4>
      <ul className="res-list">
        {winners.map(({ r, i }) => (
          <ResultRow key={r.uid} r={r} index={i} active={active} busy={busy} onSet={(idx, s) => onSet(d, idx, s)} />
        ))}
      </ul>
      {backups.length > 0 && (
        <>
          <h4 className="res-title">Yedekler</h4>
          <ul className="res-list">
            {backups.map(({ r, i }) => (
              <ResultRow key={r.uid} r={r} index={i} active={active} busy={busy} onSet={(idx, s) => onSet(d, idx, s)} />
            ))}
          </ul>
        </>
      )}
    </article>
  );
}

/** Yönetim sekmesindeki "Çekiliş" bölümü: çekiliş yap, geçmişi yönet, kazananları indir. */
export function RaffleAdmin() {
  const [raffles, setRaffles] = useState<Raffle[] | null>(null);
  const [draws, setDraws] = useState<Draw[] | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [raffleId, setRaffleId] = useState('');
  const [winners, setWinners] = useState('1');
  const [backups, setBackups] = useState('2');
  const [prize, setPrize] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, d] = await Promise.all([api.raffles(), api.draws()]);
      setRaffles(r);
      setDraws(d);
      setRaffleId((cur) => cur || r[0]?.id || '');
    } catch (e) {
      setError(msg(e, 'Çekiliş bilgileri alınamadı.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = raffles?.find((r) => r.id === raffleId);

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    setError('');
    try {
      setNote((await fn()) ?? '');
    } catch (e) {
      setError(msg(e, 'İşlem yapılamadı.'));
    } finally {
      await load();
      setBusy(false);
    }
  }

  function start(e: React.FormEvent) {
    e.preventDefault();
    const w = Number(winners);
    const b = Number(backups);
    if (!Number.isInteger(w) || w < 1 || w > 50) return setError('Kazanan sayısı 1 ile 50 arasında olmalı.');
    if (!Number.isInteger(b) || b < 0 || b > 50) return setError('Yedek sayısı 0 ile 50 arasında olmalı.');
    void run(async () => {
      const r = await api.createDraw({ raffleId, winners: w, backups: b, prize: prize.trim() });
      return r.message ?? `Çekiliş tamamlandı: ${r.winnersDrawn} kazanan, ${r.backupsDrawn} yedek.`;
    });
  }

  const setResult = (d: Draw, index: number, status: 'teslim edildi' | 'gelmedi') =>
    run(async () => (await api.setResult(d.id, index, status)).message);

  const cancelDraw = (d: Draw) => run(async () => (await api.cancelDraw(d.id), 'Çekiliş iptal edildi, kazananlar havuza geri döndü.'));

  async function download() {
    setBusy(true);
    try {
      const url = URL.createObjectURL(await api.exportDraws());
      const a = document.createElement('a');
      a.href = url;
      a.download = `devfest-cekilis-kazananlar-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(msg(e, 'Dosya indirilemedi.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <div className="section-head tight">
          <h2>Çekiliş</h2>
          <a className="btn btn-gold btn-sm" href="#cekilis" target="_blank" rel="noreferrer">
            Tam ekran sahneyi aç
          </a>
        </div>
        <p className="sub small">Seçim sunucuda yapılır; havuza yalnızca şansı olan, daha önce kazanmamış katılımcılar girer (görevli ve yöneticiler hariç).</p>

        {raffles && raffles.length === 0 && <p className="muted">Çekiliş kategorisi tanımlı değil. event.json içine “raffles” ekleyip seed çalıştırın.</p>}

        {raffles && raffles.length > 0 && (
          <form className="form" onSubmit={start}>
            <div className="field">
              <span className="label" id="rf-cat">
                Kategori
              </span>
              <div className="rf-pick" role="group" aria-labelledby="rf-cat">
                {raffles.map((r) => (
                  <button key={r.id} type="button" aria-pressed={r.id === raffleId} onClick={() => setRaffleId(r.id)}>
                    <b>{r.name}</b>
                    <span>
                      havuz {r.poolSize} kişi · toplam şans {r.totalWeight}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="row3">
              <div className="field">
                <label htmlFor="rf-w">Kazanan sayısı</label>
                <input id="rf-w" type="number" inputMode="numeric" min={1} max={50} value={winners} onChange={(e) => setWinners(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rf-b">Yedek sayısı</label>
                <input id="rf-b" type="number" inputMode="numeric" min={0} max={50} value={backups} onChange={(e) => setBackups(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="rf-p">
                  Ödül adı<span className="optional">isteğe bağlı</span>
                </label>
                <input id="rf-p" type="text" maxLength={120} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Örn. Kulaklık" />
              </div>
            </div>
            <button type="submit" className="btn btn-red" disabled={busy || !selected || selected.poolSize === 0}>
              {busy ? 'Çalışıyor…' : 'Çekilişi başlat'}
            </button>
            {selected && selected.poolSize === 0 && <p className="hint-line">Bu kategoride havuz boş.</p>}
          </form>
        )}

        {note && (
          <p className="note" role="status">
            {note}
          </p>
        )}
        {error && <p className="err-text">{error}</p>}
      </div>

      <div className="card">
        <div className="section-head tight">
          <h2>Çekiliş geçmişi</h2>
          <button type="button" className="btn btn-red btn-sm" onClick={download} disabled={busy || !draws?.length}>
            Kazananları indir
          </button>
        </div>
        {!draws ? (
          <p className="muted">Yükleniyor…</p>
        ) : draws.length === 0 ? (
          <p className="muted">Henüz çekiliş yapılmadı.</p>
        ) : (
          draws.map((d) => <DrawCard key={d.id} d={d} busy={busy} onSet={setResult} onCancel={cancelDraw} />)
        )}
      </div>
    </>
  );
}
