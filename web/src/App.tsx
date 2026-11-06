import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { api, ApiError } from './api';
import { auth, completeLoginLink, isGmail, isLoginLink, logOut, storedLinkEmail } from './firebase';
import { useLeaderboard } from './useLeaderboard';
import type { EventConfig, Me, RedeemResult } from './types';
import { Header, allowedViews, type View } from './components/Header';
import { AuthScreen, type AuthTab } from './components/AuthScreen';
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
  const [linkAsk, setLinkAsk] = useState(false);
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
      setNotice(`${u.email || 'Bu hesap'} kişisel Gmail adresi değil. Öğrenci ya da kurum e-postası yerine kendi Gmail hesabınla devam et.`);
      await logOut();
      return;
    }
    try {
      setMe(await api.me());
      setNotice('');
      setPhase('ready');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'NOT_REGISTERED') {
        // Kayıt ol sekmesinden gelindiyse sunucudaki kayıt bilgileriyle (niyet) kaydı tamamla
        try {
          setMe(await api.register());
          setNotice('');
          setPhase('ready');
          showToast('Pasaportun hazır. İlk kodunu gir!');
          return;
        } catch (err) {
          if (!(err instanceof ApiError && err.code === 'NEEDS_DETAILS')) {
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
    // Gmail'deki giriş bağlantısıyla açıldıysa girişi tamamla
    if (isLoginLink()) {
      const stored = storedLinkEmail();
      if (stored) void finishLink(stored);
      else setLinkAsk(true);
    }
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

  async function finishLink(email: string) {
    try {
      await completeLoginLink(email);
      setLinkAsk(false);
    } catch {
      setLinkAsk(false);
      window.history.replaceState(null, '', '/');
      setNotice('Giriş bağlantısı geçersiz ya da süresi dolmuş. Gmail adresini yazıp yeni bağlantı iste.');
    }
  }

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
    setAuthTab('giris');
    await logOut();
    if (window.location.hash) window.location.hash = '';
    showToast('Çıkış yaptın. Aynı Gmail ile giriş yapınca ilerlemen geri gelir.');
  }

  let body: React.ReactNode;
  if (linkAsk) {
    body = <LinkConfirm onConfirm={finishLink} />;
  } else if (fatal && phase !== 'signedOut') {
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

/** Bağlantı başka bir cihazda/tarayıcıda açıldıysa Gmail adresini doğrulatır. */
function LinkConfirm({ onConfirm }: { onConfirm: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="auth">
      <div className="card">
        <h2>Girişi onayla</h2>
        <p className="sub small">Bağlantıyı istediğin tarayıcıdan farklı bir yerde açtın. Bağlantının gittiği Gmail adresini yaz.</p>
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!isGmail(email.trim())) return;
            setBusy(true);
            await onConfirm(email.trim().toLowerCase());
            setBusy(false);
          }}
        >
          <div className="field">
            <label htmlFor="link-email">Gmail adresin</label>
            <input id="link-email" type="email" inputMode="email" autoCapitalize="none" placeholder="ornek@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <button className="btn btn-red" type="submit" disabled={busy}>
            {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
          </button>
        </form>
      </div>
    </div>
  );
}
