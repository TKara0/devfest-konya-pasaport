import { Icon } from './Icon';
import type { Me, Session, Task } from '../types';

interface Props {
  tasks: Task[];
  sessions: Session[];
  me: Me;
  justDone?: string | null;
}

export function TaskGrid({ tasks, sessions, me, justDone }: Props) {
  const complete = tasks.filter((t) => (me.progress[t.id] || 0) >= t.total).length;
  const sessionById = Object.fromEntries(sessions.map((s) => [s.id, s]));

  return (
    <div className="tasks-block">
      <div className="section-head">
        <div>
          <p className="eyebrow">Görevler</p>
          <h2>Pasaport ilerlemen</h2>
        </div>
        <span className="meta">
          {complete}/{tasks.length} görev tamam
        </span>
      </div>

      <div className="tasks">
        {tasks.map((t) => {
          const n = Math.min(me.progress[t.id] || 0, t.total);
          const done = n >= t.total;
          const items =
            t.type === 'static'
              ? t.steps.map((s) => ({ id: s.id, label: s.label, on: me.done.includes(s.id) }))
              : t.type === 'session'
                ? Object.values(me.sessions).map((sid) => ({ id: sid, label: sessionById[sid]?.title || sid, on: true }))
                : [];

          return (
            <article key={t.id} className={`task${done ? ' done' : ''}`}>
              <div className="task-top">
                <span className="task-ico">
                  <Icon name={done ? 'check' : t.icon || 'passport'} />
                </span>
                <div className="task-text">
                  <h3>{t.name}</h3>
                  {t.desc && <p>{t.desc}</p>}
                  {t.type === 'rotating' && (
                    <span className="tag-clock">
                      <Icon name="clock" />
                      Kod {t.rotateMinutes && t.rotateMinutes !== 60 ? `${t.rotateMinutes} dakikada bir` : 'her saat'} değişir
                    </span>
                  )}
                </div>
              </div>

              <div className="stamps" role="img" aria-label={`${n} / ${t.total}`}>
                {Array.from({ length: t.total }, (_, i) => (
                  <span key={i} className={`stamp${i < n ? ' on' : ''}${justDone === t.id && i === n - 1 ? ' pop' : ''}`}>
                    {i < n && <Icon name="check" />}
                  </span>
                ))}
              </div>

              <div className="meta">
                <span>
                  {n}/{t.total}
                </span>
                <span className="reward">{t.rewardLabel || `${t.reward} hak`}</span>
              </div>

              {items.length > 0 && (
                <details className="steps-list">
                  <summary>{t.type === 'session' ? 'Katıldığın oturumlar' : 'Ayrıntılar'}</summary>
                  <ul>
                    {items.map((s) => (
                      <li key={s.id} className={s.on ? 'on' : ''}>
                        <span className="mini-check">{s.on && <Icon name="check" />}</span>
                        {s.label}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
