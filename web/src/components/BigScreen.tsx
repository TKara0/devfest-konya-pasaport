import { useLeaderboard } from '../useLeaderboard';
import { Icon } from './Icon';

/** Salondaki büyük ekran / projeksiyon için tam ekran Top 20. Giriş gerektirmez. */
export function BigScreen() {
  const { board, error } = useLeaderboard(10_000);
  const top = board?.top ?? [];

  return (
    <div className="screen">
      <header className="screen-head">
        <div className="mark big-mark">
          Devfest<span>Konya</span>
          <em>’26</em>
        </div>
        <div className="screen-cta">
          <span>Kodlarını gir, sıralamaya çık</span>
          <b>{window.location.host}</b>
        </div>
      </header>

      <div className="screen-body">
        <div className="screen-podium">
          {[1, 0, 2].map((i) =>
            top[i] ? (
              <div key={i} className={`pod p${i + 1}`}>
                <div className="n">{i + 1}</div>
                <b>{top[i].name}</b>
                <span>
                  <Icon name="ticket" /> {top[i].tickets} hak
                </span>
              </div>
            ) : (
              <div key={i} className={`pod p${i + 1} empty`}>
                <div className="n">{i + 1}</div>
              </div>
            ),
          )}
        </div>
        <ol className="screen-list">
          {top.slice(3, 20).map((r) => (
            <li key={r.username}>
              <span className="rank">{r.rank}</span>
              <span className="who">
                <b>{r.name}</b>
                <span>@{r.username}</span>
              </span>
              <span className="score">{r.tickets}</span>
            </li>
          ))}
        </ol>
      </div>

      <footer className="screen-foot">
        <span className={`lb-live${error ? ' off' : ''}`}>
          <i />
          {error ? 'Bağlantı bekleniyor' : 'Canlı'}
        </span>
        <span>{board ? `${board.participants} katılımcı` : ''}</span>
      </footer>
    </div>
  );
}
