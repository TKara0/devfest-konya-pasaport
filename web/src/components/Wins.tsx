import { Icon } from './Icon';
import type { Win } from '../types';

/** Kazanılan çekilişler: pasaportun en üstünde. Yedeklik bilgisi buraya hiç gelmez. */
export function Wins({ wins }: { wins: Win[] }) {
  return (
    <div className="wins">
      {wins.map((w, i) =>
        w.status === 'teslim edildi' ? (
          <div key={i} className="card win win-done" role="status">
            <span className="win-ico">
              <Icon name="check" />
            </span>
            <div>
              <h2>Ödülünü aldın</h2>
              <p>
                {w.category}
                {w.prize ? ` · ${w.prize}` : ''}
              </p>
            </div>
          </div>
        ) : (
          <div key={i} className="card win" role="status">
            <span className="win-ico">
              <Icon name="trophy" />
            </span>
            <div>
              <p className="eyebrow">{w.category}</p>
              <h2>Kazandın!</h2>
              {w.prize && <p className="win-prize">{w.prize}</p>}
              <p>Ödülünü almak için kayıt masasına gel.</p>
            </div>
          </div>
        ),
      )}
    </div>
  );
}
