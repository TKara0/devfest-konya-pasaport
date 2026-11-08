import { Icon } from './Icon';
import { Tag } from './Tag';
import { useClock } from '../useClock';
import { flowItems, statusOf, type FlowItem } from '../now';
import { slotKey, type EventConfig, type Me } from '../types';

/** Akış sekmesi: oturumlar ve oturum olmayan maddeler (kayıt, ara, öğle arası, çekiliş…) tek listede. */
export function Sessions({ config, me }: { config: EventConfig; me: Me }) {
  const clock = useClock(config.event.date);
  const items = flowItems(config);
  const starts = [...new Set(items.map((i) => i.start))];
  const hallName = (id: string | null) => (id === null ? 'Tüm alan' : config.halls.find((h) => h.id === id)?.name ?? id);

  return (
    <section>
      <div className="section-head page-head">
        <div>
          <p className="eyebrow">Program</p>
          <h1>Akış</h1>
          <p className="sub">
            Aynı saatteki paralel oturumlardan yalnızca birine katılabilirsin. Oturum sonunda konuşmacının gösterdiği kodu
            Pasaport sekmesinde gir.
          </p>
        </div>
      </div>

      {items.length === 0 && <p className="muted">Program henüz yayınlanmadı.</p>}

      <div className="slots">
        {starts.map((start) => {
          const joined = me.sessions[slotKey(start)];
          return (
            <div key={start} className="slot">
              <time>{start}</time>
              <div className="slot-row">
                {items
                  .filter((i) => i.start === start)
                  .map((i) => (
                    <Item key={i.id} item={i} hall={hallName(i.hall)} hallIndex={config.halls.findIndex((h) => h.id === i.hall)} status={statusOf(i, clock, config.event.date)} joined={joined} />
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Item({ item, hall, hallIndex, status, joined }: { item: FlowItem; hall: string; hallIndex: number; status: ReturnType<typeof statusOf>; joined?: string }) {
  const session = item.kind === 'session';
  const att = session && joined === item.id;
  const locked = session && !!joined && !att;
  const cls = ['sess', item.hall === null && 'all', status === 'live' && 'live', status === 'past' && 'past', att && 'attended', locked && 'locked'];

  return (
    <div className={cls.filter(Boolean).join(' ')}>
      <div className="sess-text">
        <div className="hall">
          {hall} · {item.start}
          {item.end !== item.start && `–${item.end}`}
          {status === 'live' && <span className="badge ok sess-live">Şu an</span>}
        </div>
        <h3>
          {item.title}
          <Tag tag={item.tag} hallIndex={hallIndex} />
        </h3>
        {item.speaker && <p>{item.speaker}</p>}
        {item.note && <p>{item.note}</p>}
        {locked && <div className="lock">Bu saatte diğer oturuma katıldın</div>}
      </div>
      {session && <span className={`stamp st${att ? ' on' : ''}`}>{att && <Icon name="check" />}</span>}
    </div>
  );
}
