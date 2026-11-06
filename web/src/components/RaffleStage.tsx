import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import { fullName, type DrawCreated, type DrawResult, type Raffle } from '../types';

type Phase = 'setup' | 'drawing' | 'done';

function Stepper({ id, label, value, min, max, onChange }: { id: string; label: string; value: string; min: number; max: number; onChange: (v: string) => void }) {
  const n = Number(value);
  const set = (v: number) => onChange(String(Math.min(max, Math.max(min, v))));
  return (
    <div className="stage-field">
      <label htmlFor={id}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`${label} azalt`} onClick={() => set((Number.isInteger(n) ? n : min) - 1)}>
          −
        </button>
        <input id={id} type="number" inputMode="numeric" min={min} max={max} value={value} onChange={(e) => onChange(e.target.value)} />
        <button type="button" aria-label={`${label} artır`} onClick={() => set((Number.isInteger(n) ? n : min) + 1)}>
          +
        </button>
      </div>
    </div>
  );
}

/**
 * Projektörde açılan tam ekran çekiliş sahnesi (#cekilis, yalnızca yönetici).
 * Sonuç sunucudan gelir; ekrandaki dönen isimler yalnızca gösteridir ve sonucu etkilemez.
 */
export function RaffleStage({ onExit }: { onExit: () => void }) {
  const [phase, setPhase] = useState<Phase>('setup');
  const [raffles, setRaffles] = useState<Raffle[] | null>(null);
  const [raffleId, setRaffleId] = useState('');
  const [winners, setWinners] = useState('1');
  const [backups, setBackups] = useState('2');
  const [prize, setPrize] = useState('');
  const [error, setError] = useState('');
  const [draw, setDraw] = useState<DrawCreated | null>(null);
  const [shown, setShown] = useState<DrawResult[]>([]);
  const [reel, setReel] = useState('');
  const [reelLabel, setReelLabel] = useState('');
  const [landed, setLanded] = useState(false);
  const [isFull, setIsFull] = useState(!!document.fullscreenElement);

  const alive = useRef(true);
  const skip = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  const loadRaffles = useCallback(async () => {
    try {
      const r = await api.raffles();
      if (!alive.current) return;
      setRaffles(r);
      setRaffleId((cur) => (r.some((x) => x.id === cur) ? cur : r[0]?.id || ''));
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : 'Çekiliş kategorileri alınamadı.');
    }
  }, []);

  useEffect(() => {
    void loadRaffles();
  }, [loadRaffles]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      /* tarayıcı reddederse sessizce devam */
    }
  }

  /** Atla'ya basılana kadar bekler. */
  async function wait(ms: number) {
    const end = performance.now() + ms;
    while (alive.current && !skip.current && performance.now() < end) {
      await new Promise((r) => setTimeout(r, Math.min(40, Math.max(0, end - performance.now()))));
    }
  }

  /** Havuzdaki isimleri hızla döndürür, giderek yavaşlar ve hedef isimde durur. */
  async function spin(target: string, names: string[], total: number) {
    const pool = names.length ? names : [target];
    const t0 = performance.now();
    setLanded(false);
    for (;;) {
      const t = performance.now() - t0;
      if (!alive.current || skip.current || t >= total) break;
      setReel(pool[Math.floor(Math.random() * pool.length)]); // yalnızca görüntü
      await wait(45 + 380 * Math.pow(t / total, 2.2));
    }
    setReel(target);
    setLanded(true);
  }

  async function reveal(res: DrawCreated, names: string[]) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(res.results);
      return;
    }
    // Az kazananda her isim uzun uzun döner; çok kazananda sahne uzamasın diye süreler kısalır
    const pace = res.results.length <= 4 ? 1 : res.results.length <= 12 ? 0.55 : 0.28;
    for (const r of res.results) {
      if (!alive.current) return;
      setReelLabel(r.kind === 'kazanan' ? `${r.order}. kazanan` : `${r.order}. yedek`);
      await spin(fullName(r), names, (r.kind === 'kazanan' ? 3400 : 1700) * pace);
      if (!alive.current) return;
      setShown((s) => [...s, r]);
      await wait((r.kind === 'kazanan' ? 1100 : 600) * pace);
    }
    if (skip.current) setShown(res.results);
  }

  async function start() {
    const w = Number(winners);
    const b = Number(backups);
    if (!Number.isInteger(w) || w < 1 || w > 50) return setError('Kazanan sayısı 1 ile 50 arasında olmalı.');
    if (!Number.isInteger(b) || b < 0 || b > 50) return setError('Yedek sayısı 0 ile 50 arasında olmalı.');
    setError('');
    skip.current = false;
    setShown([]);
    setDraw(null);
    setReel('Çekiliş yapılıyor…');
    setReelLabel('');
    setLanded(false);
    setPhase('drawing');

    // Dönecek isimler çekilişten ÖNCE alınır (çekilişten sonra kazananlar havuzdan çıkar)
    const names = await api.raffleNames(raffleId).then((x) => x.names, () => [] as string[]);
    try {
      const res = await api.createDraw({ raffleId, winners: w, backups: b, prize: prize.trim() });
      if (!alive.current) return;
      setDraw(res);
      await reveal(res, names);
      if (!alive.current) return;
      setReel('');
      setReelLabel('');
      setPhase('done');
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e.message : 'Çekiliş yapılamadı. Bağlantıyı kontrol edip tekrar dene.');
      setPhase('setup');
      void loadRaffles();
    }
  }

  function again() {
    setPhase('setup');
    setDraw(null);
    setShown([]);
    setError('');
    void loadRaffles();
  }

  const selected = raffles?.find((r) => r.id === raffleId);
  const winnerRows = shown.filter((r) => r.kind === 'kazanan');
  const backupRows = shown.filter((r) => r.kind === 'yedek');
  const dense = (draw?.results.length ?? 0) > 12;

  return (
    <div className="stage">
      <header className="stage-head">
        <div className="mark big-mark">
          Devfest<span>Konya</span>
          <em>’26</em>
        </div>
        <div className="stage-tools">
          {phase === 'drawing' && (
            <button type="button" className="btn btn-ghost" onClick={() => (skip.current = true)}>
              Hemen göster
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={toggleFullscreen}>
            {isFull ? 'Tam ekrandan çık' : 'Tam ekran'}
          </button>
          {phase === 'setup' && (
            <button type="button" className="btn btn-ghost" onClick={onExit}>
              Yönetime dön
            </button>
          )}
        </div>
      </header>

      {phase === 'setup' && (
        <section className="stage-setup" aria-label="Çekiliş kurulumu">
          <h1>Çekiliş</h1>

          {!raffles && !error && <p className="stage-note">Kategoriler yükleniyor…</p>}
          {raffles && raffles.length === 0 && <p className="stage-note">Çekiliş kategorisi tanımlı değil. event.json içine “raffles” ekleyip seed çalıştırın.</p>}

          {raffles && raffles.length > 0 && (
            <>
              <div className="stage-field">
                <span className="stage-label" id="st-cat">
                  Kategori
                </span>
                <div className="rf-pick" role="group" aria-labelledby="st-cat">
                  {raffles.map((r) => (
                    <button key={r.id} type="button" aria-pressed={r.id === raffleId} onClick={() => setRaffleId(r.id)}>
                      <b>{r.name}</b>
                      <span>havuz {r.poolSize} kişi</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="stage-row">
                <Stepper id="st-w" label="Kazanan sayısı" value={winners} min={1} max={50} onChange={setWinners} />
                <Stepper id="st-b" label="Yedek sayısı" value={backups} min={0} max={50} onChange={setBackups} />
                <div className="stage-field">
                  <label htmlFor="st-p">Ödül adı (isteğe bağlı)</label>
                  <input id="st-p" className="stage-input" type="text" maxLength={120} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="Örn. Kulaklık" />
                </div>
              </div>

              <button type="button" className="btn btn-gold stage-go" onClick={start} disabled={!selected || selected.poolSize === 0}>
                Çek
              </button>
              {selected && selected.poolSize === 0 && <p className="stage-note">Bu kategoride havuz boş.</p>}
            </>
          )}

          {error && (
            <p className="stage-error" role="alert">
              {error}
            </p>
          )}
        </section>
      )}

      {phase !== 'setup' && (
        <section className="stage-run" aria-label="Çekiliş sonuçları">
          <div className="stage-title">
            <h1>{draw?.raffleName ?? selected?.name ?? 'Çekiliş'}</h1>
            {(draw?.prize ?? prize.trim()) && <p>{draw?.prize ?? prize.trim()}</p>}
          </div>

          {phase === 'drawing' && (
            <div className="reel-wrap" aria-live="off">
              <div className="reel-label">{reelLabel || ' '}</div>
              <div className={`reel${landed ? ' landed' : ''}`}>{reel}</div>
            </div>
          )}

          <div aria-live="polite">
            {winnerRows.length > 0 && (
              <div className="stage-results">
                <h2>Kazananlar</h2>
                <ol className={`winner-grid${dense ? ' dense' : ''}`}>
                  {winnerRows.map((r) => (
                    <li key={r.uid} className="winner">
                      <span className="n">{r.order}</span>
                      <b>{fullName(r)}</b>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {backupRows.length > 0 && (
              <div className="stage-results">
                <h2>Yedekler</h2>
                <ol className={`winner-grid${dense ? ' dense' : ''}`}>
                  {backupRows.map((r) => (
                    <li key={r.uid} className="winner backup">
                      <span className="n">{r.order}</span>
                      <b>{fullName(r)}</b>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          {phase === 'done' && (
            <div className="stage-done">
              {draw?.message && <p className="stage-note">{draw.message}</p>}
              <p className="stage-note small">Sonuçlar kaydedildi. Teslim durumunu Yönetim → Çekiliş geçmişinden işaretleyebilirsin.</p>
              <button type="button" className="btn btn-gold stage-again" onClick={again}>
                Yeni çekiliş
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
