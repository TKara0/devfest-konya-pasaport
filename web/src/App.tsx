import { useCallback, useEffect, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import { api, ApiError } from './api';
import { auth, logOut } from './firebase';
import { useLeaderboard } from './useLeaderboard';
import type { EventConfig, Me, RedeemResult } from './types';
import { Header, allowedViews, type View } from './components/Header';
import { Landing } from './components/Landing';
import { RegisterForm } from './components/RegisterForm';
import { CodeEntry } from './components/CodeEntry';
import { TaskGrid } from './components/TaskGrid';
import { FullBoard, MiniBoard, TicketCard } from './components/Leaderboard';
import { Sessions } from './components/Sessions';
import { Staff } from './components/Staff';
import { Admin } from './components/Admin';
import { BigScreen } from './components/BigScreen';

type Phase = 'loading' | 'signedOut' | 'needsProfile' | 'ready' | 'error';
const VIEWS: View[] = ['pasaport', 'oturumlar', 'siralama', 'gorevli', 'yonetim'];

function readHash(): string {
  return window.location.hash.replace(/^#/, '');
}

export default function App() {
  const [hash, setHash] = useState(readHash());
  useEffect(() => {
    const on = () => setHash(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  if (hash === 'ekran') return <BigScreen />;
  return <Main hash={hash} />;
}

function Main({ hash }: { hash: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [config, setConfig] = useState<EventConfig | null>(null);
  const [fatal, setFatal] = useState('');
  const [justDone, setJustDone] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number>(undefined);

  const showToast = useCallback((m: string) => {
    setToast(m);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  /* Etkinlik yapılandırması */
  useEffect(() => {
    api.config().then(setConfig).catch((e) => setFatal(e instanceof ApiError ? e.message : 'Etkinlik bilgileri yüklenemedi.'));
  }, []);

  /* Oturum durumu */
  const loadMe = useCallback(async () => {
    try {
      setMe(await api.me());
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_REGISTERED') setPhase('needsProfile');
      else {
        setFatal(e instanceof ApiError ? e.message : 'Bilgilerin yüklenemedi.');
        setPhase('error');
      }
    }
  }, []);

  useEffect(() => {
    void getRedirectResult(auth).catch(() => undefined);
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMe(null);
      if (!u) setPhase('signedOut');
      else {
        setPhase('loading');
        void loadMe();
      }
    });
  }, [loadMe]);

  /* Gezinme */
  const allowed = allowedViews(me);
  const view: View = VIEWS.includes(hash as View) && allowed.includes(hash as View) ? (hash as View) : 'pasaport';
  const nav = (v: View) => {
    window.location.hash = v === 'pasaport' ? '' : v;
    window.scrollTo({ top: 0 });
  };

  const { board, error: boardErr, reload: reloadBoard } = useLeaderboard();

  function onRedeemed(r: RedeemResult) {
    setMe((prev) => (prev ? { ...r.user, rank: prev.rank, role: prev.role } : r.user));
    setJustDone(r.taskId);
    showToast('Pasaportuna damga vuruldu');
    // Sıralamadaki yerini birkaç saniye sonra tazele
    window.setTimeout(() => {
      void api.me().then((m) => setMe(m)).catch(() => undefined);
      void reloadBoard();
    }, 1500);
  }

  async function onLogout() {
    await logOut();
    showToast('Çıkış yaptın. İlerlemen Gmail hesabına bağlı, istediğin zaman geri gelir.');
  }

  let body: React.ReactNode;
  if (fatal && phase !== 'signedOut') {
    body = (
      <div className="auth">
        <div className="card warn">
          <h3>Bir sorun var</h3>
          <p>{fatal}</p>
          <button type="button" className="btn btn-red" onClick={() => window.location.reload()}>
            Sayfayı yenile
          </button>
        </div>
      </div>
    );
  } else if (phase === 'loading' || (phase === 'ready' && !config)) {
    body = <div className="loading" aria-busy="true">Pasaport açılıyor…</div>;
  } else if (phase === 'signedOut') {
    body = <Landing />;
  } else if (phase === 'needsProfile' && user) {
    body = (
      <RegisterForm
        email={user.email || ''}
        defaultName={user.displayName || ''}
        onDone={(m) => {
          setMe(m);
          setPhase('ready');
          showToast('Pasaportun hazır. İlk kodunu gir!');
        }}
      />
    );
  } else if (phase === 'ready' && me && config) {
    if (view === 'oturumlar') body = <Sessions sessions={config.sessions} me={me} />;
    else if (view === 'siralama') body = <FullBoard board={board} me={me} error={boardErr} />;
    else if (view === 'gorevli') body = <Staff />;
    else if (view === 'yonetim') body = <Admin />;
    else
      body = (
        <div className="grid">
          <div className="col">
            <CodeEntry firstName={me.firstName} onRedeemed={onRedeemed} />
            <TaskGrid tasks={config.tasks} sessions={config.sessions} me={me} justDone={justDone} />
          </div>
          <div className="col">
            <TicketCard me={me} tasks={config.tasks} />
            <MiniBoard board={board} me={me} error={boardErr} onMore={() => nav('siralama')} />
          </div>
        </div>
      );
  }

  return (
    <>
      <Header me={phase === 'ready' ? me : null} view={view} onNav={nav} onLogout={onLogout} />
      <main>
        <div className={`shell${phase === 'ready' ? ' with-nav' : ''}`}>{body}</div>
        <div className="band" role="img" aria-label="Konya surları ve Sultan Alparslan Kongre Merkezi çizimi" />
      </main>
      <div className={`toast${toast ? ' show' : ''}`} role="status">
        {toast}
      </div>
    </>
  );
}
