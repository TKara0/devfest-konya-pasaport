import { useCallback, useEffect, useRef, useState } from 'react';
import { getRedirectResult, onAuthStateChanged, type User } from 'firebase/auth';
import { api, ApiError } from './api';
import { auth, isGmail, logOut } from './firebase';
import { useLeaderboard } from './useLeaderboard';
import type { EventConfig, Me, RedeemResult } from './types';
import { Header, allowedViews, type View } from './components/Header';
import { AuthScreen, pendingDraft, type AuthTab } from './components/AuthScreen';
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
  const [authTab, setAuthTab] = useState<AuthTab>('giris');
  const [authKey, setAuthKey] = useState(0);
  const [notice, setNotice] = useState('');
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
  const loadMe = useCallback(async (u: User) => {
    // Kimlik kişisel Gmail: öğrenci/kurum hesabıyla girilirse hemen çıkış yap
    if (!isGmail(u.email)) {
      pendingDraft.clear();
      setNotice(`${u.email || 'Bu hesap'} kişisel Gmail adresi değil. Öğrenci ya da kurum e-postası yerine kendi Gmail hesabınla devam et.`);
      await logOut();
      return;
    }
    try {
      setMe(await api.me());
      pendingDraft.clear();
      setNotice('');
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_REGISTERED') {
        // Kayıt ol sekmesinden gelindiyse formdaki bilgilerle kaydı tamamla
        const draft = pendingDraft.take();
        if (draft) {
          try {
            setMe(await api.register(draft));
            setNotice('');
            setPhase('ready');
            showToast('Pasaportun hazır. İlk kodunu gir!');
            return;
          } catch (err) {
            setNotice(err instanceof ApiError ? err.message : 'Kayıt tamamlanamadı, tekrar dene.');
          }
        }
        setAuthTab('kayit');
        setPhase('needsProfile');
      } else if (e instanceof ApiError && (e.code === 'GMAIL_REQUIRED' || e.code === 'EMAIL_NOT_VERIFIED')) {
        setNotice(e.message);
        await logOut();
      } else {
        setFatal(e instanceof ApiError ? e.message : 'Bilgilerin yüklenemedi.');
        setPhase('error');
      }
    }
  }, [showToast]);

  useEffect(() => {
    void getRedirectResult(auth).catch(() => undefined);
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setMe(null);
      if (!u) setPhase('signedOut');
      else {
        setPhase('loading');
        void loadMe(u);
      }
    });
  }, [loadMe]);

  const openAuth = (tab: AuthTab) => {
    setAuthTab(tab);
    setAuthKey((k) => k + 1);
    setNotice('');
  };

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
    pendingDraft.clear();
    setAuthTab('giris');
    await logOut();
    if (window.location.hash) window.location.hash = '';
    showToast('Çıkış yaptın. Aynı Gmail ile giriş yapınca ilerlemen geri gelir.');
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
  } else if (phase === 'signedOut' || (phase === 'needsProfile' && user)) {
    body = (
      <AuthScreen
        key={`${authKey}-${user?.uid ?? 'anon'}`}
        initialTab={authTab}
        signedInEmail={phase === 'needsProfile' ? user?.email : null}
        signedInName={user?.displayName || ''}
        notice={notice}
        onRegistered={(m) => {
          setMe(m);
          setNotice('');
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
      <Header
        me={phase === 'ready' ? me : null}
        view={view}
        onNav={nav}
        onLogout={onLogout}
        onAuth={phase === 'signedOut' ? openAuth : undefined}
        pendingEmail={phase === 'needsProfile' ? user?.email : null}
      />
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
