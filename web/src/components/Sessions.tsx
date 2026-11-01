import { Icon } from './Icon';
import { slotKey, type Me, type Session } from '../types';

export function Sessions({ sessions, me }: { sessions: Session[]; me: Me }) {
  const slots = [...new Set(sessions.map((s) => s.slot))].sort();

  return (
    <section>
      <div className="section-head page-head">
        <div>
          <p className="eyebrow">Program</p>
          <h1>Oturumlar</h1>
          <p className="sub">
            Aynı saatteki paralel oturumlardan yalnızca birine katılabilirsin. Oturum sonunda konuşmacının gösterdiği kodu
            Pasaport sekmesinde gir.
          </p>
        </div>
      </div>

      {slots.length === 0 && <p className="muted">Program henüz yayınlanmadı.</p>}

      <div className="slots">
        {slots.map((slot) => {
          const attended = me.sessions[slotKey(slot)];
          return (
            <div key={slot} className="slot">
              <time>{slot}</time>
              <div className="slot-row">
                {sessions
                  .filter((s) => s.slot === slot)
                  .map((s) => {
                    const att = attended === s.id;
                    const locked = !!attended && !att;
                    return (
                      <div key={s.id} className={`sess${att ? ' attended' : ''}${locked ? ' locked' : ''}`}>
                        <div className="sess-text">
                          <div className="hall">{s.hall}</div>
                          <h3>{s.title}</h3>
                          {s.speaker && <p>{s.speaker}</p>}
                          {locked && <div className="lock">Bu saatte diğer oturuma katıldın</div>}
                        </div>
                        <span className={`stamp st${att ? ' on' : ''}`}>{att && <Icon name="check" />}</span>
                      </div>
                    );
                  })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
