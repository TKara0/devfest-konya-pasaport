import { Icon } from './Icon';
import type { Board, BoardRow, Me, Task } from '../types';

function Row({ r, you }: { r: BoardRow; you: boolean }) {
  return (
    <li className={you ? 'you' : undefined}>
      <span className="rank">{r.rank}</span>
      <span className="who">
        <b>
          {r.name}
          {you && <span className="you-tag">SEN</span>}
        </b>
      </span>
      <span className="score">
        <Icon name="ticket" />
        {r.tickets}
      </span>
    </li>
  );
}

const Live = ({ error }: { error?: boolean }) => (
  <span className={`lb-live${error ? ' off' : ''}`}>
    <i />
    {error ? 'Bağlantı bekleniyor' : 'Canlı'}
  </span>
);

export function TicketCard({ me, tasks }: { me: Me; tasks: Task[] }) {
  const max = tasks.reduce((a, t) => a + t.total * t.reward, 0) || 1;
  return (
    <div className="card tickets">
      <p className="eyebrow">Çekiliş hakkın</p>
      <div className="big">
        <span>{me.tickets}</span>
        <small>hak</small>
      </div>
      <div className="bar bar-gold">
        <i style={{ width: `${Math.min(100, (me.tickets / max) * 100)}%` }} />
      </div>
      <div className="tickets-row">
        <span>
          Sıralaman <b>{me.rank ? `${me.rank}.` : '–'}</b>
        </span>
        <span>
          Alınabilecek en fazla <b>{max}</b>
        </span>
      </div>
    </div>
  );
}

export function MiniBoard({ board, me, error, onMore }: { board: Board | null; me: Me; error: boolean; onMore: () => void }) {
  return (
    <div className="card mini-board">
      <div className="section-head tight">
        <h2>İlk 5</h2>
        <Live error={error} />
      </div>
      {!board ? (
        <p className="muted">Sıralama yükleniyor…</p>
      ) : board.top.length === 0 ? (
        <p className="muted">Henüz kimse kod girmedi. İlk sen ol!</p>
      ) : (
        <ol className="lb">
          {board.top.slice(0, 5).map((r) => (
            <Row key={r.id} r={r} you={r.id === me.publicId} />
          ))}
        </ol>
      )}
      <button type="button" className="btn btn-ghost wide" onClick={onMore}>
        Top 20’yi gör
      </button>
    </div>
  );
}

export function FullBoard({ board, me, error }: { board: Board | null; me: Me; error: boolean }) {
  const top = board?.top ?? [];
  const inTop = top.some((r) => r.id === me.publicId);
  return (
    <section>
      <div className="section-head page-head">
        <div>
          <p className="eyebrow">{board ? `${board.participants} katılımcı` : 'Sıralama'}</p>
          <h1>Sıralama</h1>
          <p className="sub">En çok çekiliş hakkı toplayan 20 kişi. Liste birkaç saniyede bir güncellenir.</p>
        </div>
        <Live error={error} />
      </div>

      {top.length >= 3 && (
        <div className="podium">
          {[1, 0, 2].map((i) => (
            <div key={i} className={`pod p${i + 1}`}>
              <div className="n">{i + 1}</div>
              <b>
                {top[i].name}
                {top[i].id === me.publicId ? ' (sen)' : ''}
              </b>
              <span>{top[i].tickets} hak</span>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        {!board ? (
          <p className="muted">Sıralama yükleniyor…</p>
        ) : top.length === 0 ? (
          <p className="muted">Henüz kimse kod girmedi.</p>
        ) : (
          <ol className="lb">
            {(top.length >= 3 ? top.slice(3) : top).map((r) => (
              <Row key={r.id} r={r} you={r.id === me.publicId} />
            ))}
          </ol>
        )}
        {board && !inTop && (
          <p className="muted your-rank">
            Senin sıran: <b>{me.rank ? `${me.rank}.` : 'henüz yok'}</b> · {me.tickets} hak
          </p>
        )}
      </div>
    </section>
  );
}
