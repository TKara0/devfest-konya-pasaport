import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Stats } from '../types';
import { RaffleAdmin } from './RaffleAdmin';

const EXPORTS = [
  { mode: 'ozet', title: 'Özet liste', desc: 'Kişi başı tek satır: çekiliş hakkı ve görev bazında ilerleme.' },
  { mode: 'hak', title: 'Görev çekilişi', desc: 'Her çekiliş hakkı için bir satır. Çekiliş uygulamasına yükleyince ağırlıklı çekiliş olur.' },
  { mode: 'oturum', title: 'Oturum çekilişi', desc: 'Katılınan her oturum için bir satır. Paralel oturumlardan yalnızca biri sayılır.' },
] as const;

export function Admin() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try {
      setStats(await api.stats());
      setError('');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'İstatistikler alınamadı.');
    }
  }

  useEffect(() => {
    void load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  async function download(mode: 'ozet' | 'hak' | 'oturum') {
    setBusy(mode);
    try {
      const blob = await api.exportCsv(mode);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `devfest-pasaport-${mode}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Dosya indirilemedi.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="section-head page-head">
        <div>
          <p className="eyebrow">Yönetim</p>
          <h1>Canlı durum</h1>
        </div>
        <a className="btn btn-ghost" href="#ekran" target="_blank" rel="noreferrer">
          Büyük ekranı aç
        </a>
      </div>

      {error && <p className="err-text">{error}</p>}

      <div className="stat-row">
        <div className="card stat">
          <span className="eyebrow">Kayıtlı katılımcı</span>
          <b>{stats?.users ?? '–'}</b>
        </div>
        <div className="card stat">
          <span className="eyebrow">Toplam çekiliş hakkı</span>
          <b>{stats?.tickets ?? '–'}</b>
        </div>
      </div>

      <div className="card">
        <h2>Görev bazında tamamlama</h2>
        <table className="tbl">
          <thead>
            <tr>
              <th>Görev</th>
              <th className="num">Girilen kod</th>
            </tr>
          </thead>
          <tbody>
            {stats?.tasks.map((t) => (
              <tr key={t.id}>
                <td>{t.name}</td>
                <td className="num">{t.completions}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <RaffleAdmin />

      <div className="card">
        <h2>Çekiliş dosyaları</h2>
        <p className="sub small">İlk dört sütun çekiliş uygulamasının beklediği sırada: Zaman damgası, Ad Soyad, Telefon, E-posta.</p>
        <div className="exports">
          {EXPORTS.map((x) => (
            <div key={x.mode} className="export">
              <div>
                <h3>{x.title}</h3>
                <p>{x.desc}</p>
              </div>
              <button type="button" className="btn btn-red btn-sm" onClick={() => download(x.mode)} disabled={busy !== null}>
                {busy === x.mode ? 'Hazırlanıyor…' : 'CSV indir'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
