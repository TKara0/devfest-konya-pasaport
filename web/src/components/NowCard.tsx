import { Icon } from './Icon';
import { useClock } from '../useClock';
import { atTime, dayLabel, hhmm, leftLabel, nowState, type FlowItem, type HallNow } from '../now';
import { slotKey, type EventConfig, type Me } from '../types';

interface Props {
  config: EventConfig;
  /** giriş yapmamış ziyaretçide yok */
  me?: Me | null;
  /** "Tüm akış" bağlantısı (giriş yapınca Akış sekmesine gider) */
  onAll?: () => void;
}

const attended = (item: FlowItem, me?: Me | null) => item.kind === 'session' && me?.sessions[slotKey(item.start)] === item.id;

/** Etkinliğin canlı akışı: hangi salonda şu an ne var, sırada ne var. Giriş gerektirmez. */
export function NowCard({ config, me, onAll }: Props) {
  const clock = useClock(config.event.date);
  const state = nowState(config, clock);
  if (state.phase === 'none') return null;

  const all = onAll && (
    <button type="button" className="btn-link inline now-all" onClick={onAll}>
      Tüm akış
    </button>
  );

  if (state.phase === 'after') {
    return (
      <section className="card now now-end" aria-label="Etkinlik akışı">
        <p className="eyebrow">Etkinlik akışı</p>
        <h2>Etkinlik sona erdi.</h2>
        <p className="sub">Katıldığın için teşekkürler.</p>
      </section>
    );
  }

  if (state.phase === 'before') {
    return (
      <section className="card now" aria-label="Etkinlik akışı">
        <div className="now-head">
          <p className="eyebrow">Etkinlik akışı</p>
          {all}
        </div>
        <h2>
          {config.event.date ? `${dayLabel(config.event.date)}, ${atTime(state.startsAt)}` : atTime(state.startsAt)} başlıyoruz
        </h2>
        <ul className="now-first">
          {state.first.map((i) => (
            <li key={i.id}>
              <time>{i.start}</time>
              <span>
                {i.title}
                {i.hall && <em> · {config.halls.find((h) => h.id === i.hall)?.name}</em>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="card now" aria-label="Etkinlik akışı">
      <div className="now-head">
        <p className="eyebrow">
          <span className="now-dot" aria-hidden="true" />
          Şu an · <time>{hhmm(clock.minutes)}</time>
        </p>
        {all}
      </div>

      {state.common && (
        <div className="now-common" role="status">
          <Icon name="clock" />
          <div>
            <b>{state.common.title}</b>
            <span>
              {state.common.start}–{state.common.end} · Bitişe {leftLabel(state.commonMinutesLeft)}
            </span>
            {state.common.note && <span>{state.common.note}</span>}
          </div>
        </div>
      )}

      <div className="now-halls">
        {state.halls.map((hn) => (
          <HallColumn key={hn.hall.id} hn={hn} me={me} />
        ))}
      </div>
    </section>
  );
}

function HallColumn({ hn, me }: { hn: HallNow; me?: Me | null }) {
  const { hall, current, next, minutesLeft } = hn;
  return (
    <div className="now-hall">
      <h3>{hall.name}</h3>
      {current ? (
        <div className="now-cur">
          <span className="now-tag">Şu an</span>
          <b className="now-title">{current.title}</b>
          {current.speaker && <span className="now-sub">{current.speaker}</span>}
          {current.note && <span className="now-sub">{current.note}</span>}
          <span className="now-left">
            {current.start}–{current.end} · Bitişe {leftLabel(minutesLeft)}
          </span>
          {attended(current, me) && (
            <span className="badge ok now-joined">
              <Icon name="check" /> Katıldın
            </span>
          )}
        </div>
      ) : (
        <div className="now-cur empty">
          <span className="now-tag off">Şu an boş</span>
        </div>
      )}
      <div className="now-next">
        <span className="now-tag next">Sırada</span>
        {next ? (
          <span className="now-next-text">
            <time>{next.start}</time> {next.title}
          </span>
        ) : (
          <span className="now-next-text muted-text">Bu salonda başka madde yok</span>
        )}
      </div>
    </div>
  );
}
