/**
 * DEMO MODU — `firebase/app` ve `firebase/auth` yerine geçen sahte modül.
 * Yalnızca `npm run demo` (vite.demo.config.ts) ile derlenir; gerçek yapıya girmez.
 *
 * "Gmail ile giriş yap" denildiğinde Google penceresi yerine test hesaplarının
 * listelendiği bir seçim kutusu açılır. Seçilen hesap tarayıcıda hatırlanır.
 */

interface DemoUser {
  uid: string;
  email: string;
  displayName: string;
  getIdToken: () => Promise<string>;
}

const ACCOUNTS: { uid: string; email: string; name: string; note: string }[] = [
  { uid: 'demo-katilimci', email: 'katilimci.demo@gmail.com', name: 'Ayşe Demir', note: 'Kayıtlı katılımcı, biraz ilerlemesi var' },
  { uid: 'demo-gorevli', email: 'gorevli.demo@gmail.com', name: 'Görevli Hesap', note: 'Görevli: saatlik kodları görür' },
  { uid: 'demo-yonetici', email: 'yonetici.demo@gmail.com', name: 'Yönetici Hesap', note: 'Yönetici: istatistik ve çekiliş dosyaları' },
  { uid: 'demo-yeni', email: 'yeni.demo@gmail.com', name: 'Yeni Katılımcı', note: 'Kaydı yok: kayıt akışını dene' },
  { uid: 'demo-ogrenci', email: '203301001@ogr.selcuk.edu.tr', name: 'Öğrenci Maili', note: 'Reddedilmeli: kişisel Gmail değil' },
];

const KEY = 'pasaport-demo-user';
type Listener = (u: DemoUser | null) => void;
const listeners = new Set<Listener>();

function makeUser(uid: string, email: string, displayName: string): DemoUser {
  return { uid, email, displayName, getIdToken: async () => `demo:${uid}|${email}` };
}

function load(): DemoUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    return makeUser(d.uid, d.email, d.displayName);
  } catch {
    return null;
  }
}

const authObj: { currentUser: DemoUser | null; languageCode: string } = { currentUser: load(), languageCode: 'tr' };

function setUser(u: DemoUser | null) {
  authObj.currentUser = u;
  try {
    if (u) localStorage.setItem(KEY, JSON.stringify({ uid: u.uid, email: u.email, displayName: u.displayName }));
    else localStorage.removeItem(KEY);
  } catch {
    /* yok say */
  }
  listeners.forEach((cb) => cb(u));
}

/* ---------- Hesap seçme kutusu ---------- */
function chooseAccount(): Promise<DemoUser | null> {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'demo-picker';
    wrap.innerHTML = `
      <div class="demo-box" role="dialog" aria-modal="true" aria-labelledby="demo-title">
        <p class="demo-tag">DEMO MODU</p>
        <h2 id="demo-title">Test hesabı seç</h2>
        <p class="demo-sub">Gerçek Google girişi yerine geçer. Veriler yalnızca yerel demo sunucusunda tutulur.</p>
        <div class="demo-list">
          ${ACCOUNTS.map(
            (a, i) => `<button type="button" data-i="${i}">
              <span class="demo-av">${a.name.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
              <span class="demo-who"><b>${a.name}</b><span>${a.email}</span><em>${a.note}</em></span>
            </button>`,
          ).join('')}
        </div>
        <form class="demo-custom">
          <label for="demo-mail">Başka bir adresle dene</label>
          <div><input id="demo-mail" type="email" placeholder="ornek@gmail.com" autocomplete="off" /><button type="submit">Devam</button></div>
        </form>
        <button type="button" class="demo-cancel">Vazgeç</button>
      </div>`;
    const done = (u: DemoUser | null) => {
      wrap.remove();
      resolve(u);
    };
    wrap.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t === wrap || t.closest('.demo-cancel')) return done(null);
      const b = t.closest<HTMLButtonElement>('button[data-i]');
      if (b) {
        const a = ACCOUNTS[Number(b.dataset.i)];
        done(makeUser(a.uid, a.email, a.name));
      }
    });
    wrap.querySelector('form')!.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = (wrap.querySelector('#demo-mail') as HTMLInputElement).value.trim().toLowerCase();
      if (!email.includes('@')) return;
      done(makeUser(`demo-${email.replace(/[^a-z0-9]/g, '-')}`, email, ''));
    });
    document.body.appendChild(wrap);
    (wrap.querySelector('button[data-i]') as HTMLButtonElement)?.focus();
  });
}

/* ---------- firebase/app ---------- */
export const initializeApp = () => ({});

/* ---------- firebase/auth ---------- */
export type User = DemoUser;
export const getAuth = () => authObj;
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
export const connectAuthEmulator = () => {};
export class GoogleAuthProvider {
  setCustomParameters() {}
}
export async function signInWithPopup() {
  const u = await chooseAccount();
  if (!u) throw Object.assign(new Error('vazgeçildi'), { code: 'auth/popup-closed-by-user' });
  setUser(u);
  return { user: u };
}
export const signInWithRedirect = signInWithPopup;
export const getRedirectResult = async () => null;
export async function signOut() {
  setUser(null);
}
export function onAuthStateChanged(_auth: unknown, cb: Listener) {
  listeners.add(cb);
  setTimeout(() => cb(authObj.currentUser), 0);
  return () => listeners.delete(cb);
}

/* ---------- Kutunun stili ---------- */
const style = document.createElement('style');
style.textContent = `
.demo-picker{position:fixed;inset:0;z-index:100;background:rgba(51,3,8,.55);display:grid;place-items:center;padding:16px}
.demo-box{background:var(--paper);border-radius:14px;max-width:440px;width:100%;max-height:calc(100vh - 32px);overflow:auto;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.demo-tag{display:inline-block;margin:0 0 8px;background:var(--gold-100);color:var(--red-900);font-size:11px;font-weight:800;letter-spacing:.12em;padding:3px 8px;border-radius:4px}
.demo-sub{margin:6px 0 14px;font-size:13.5px;color:var(--muted)}
.demo-list{display:flex;flex-direction:column;gap:8px}
.demo-list button{display:flex;gap:12px;align-items:center;text-align:left;border:1px solid var(--line-2);background:var(--paper);border-radius:10px;padding:10px 12px;cursor:pointer}
.demo-list button:hover,.demo-list button:focus-visible{border-color:var(--red);background:var(--paper-2)}
.demo-av{flex:none;width:36px;height:36px;border-radius:50%;background:var(--gold-100);color:var(--red-700);display:grid;place-items:center;font-weight:800;font-size:13px}
.demo-who{display:flex;flex-direction:column;min-width:0}
.demo-who span{font-size:12.5px;color:var(--ink-2);overflow-wrap:anywhere}
.demo-who em{font-style:normal;font-size:12px;color:var(--muted)}
.demo-custom{margin-top:14px;display:flex;flex-direction:column;gap:6px;font-size:13px;font-weight:700;color:var(--ink-2)}
.demo-custom div{display:flex;gap:8px}
.demo-custom input{flex:1;min-width:0;height:40px;border:1px solid var(--line-2);border-radius:8px;padding:0 10px;font-size:15px;background:var(--paper)}
.demo-custom button{border:0;background:var(--red);color:var(--paper);border-radius:8px;padding:0 14px;font-weight:700;cursor:pointer}
.demo-cancel{margin-top:12px;width:100%;border:0;background:none;color:var(--muted);text-decoration:underline;padding:8px;cursor:pointer;font-weight:600}
`;
document.head.appendChild(style);
