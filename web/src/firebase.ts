import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';

const env = import.meta.env;

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'localhost',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-pasaport',
  appId: env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
auth.languageCode = 'tr';
void setPersistence(auth, browserLocalPersistence);

if (env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/** Önce açılır pencere; engellenirse yönlendirmeli girişe düşer. */
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, provider);
  } catch (e) {
    const code = (e as { code?: string }).code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export const logOut = () => signOut(auth);

/* ---------- Gmail adresine giriş bağlantısı (şifresiz) ---------- */
const LINK_EMAIL_KEY = 'pasaport-link-email';

/**
 * Yazılan Gmail adresine tek kullanımlık giriş bağlantısı gönderir.
 * Bağlantıya tıklayan kişi o adresin sahibi olduğunu kanıtlamış olur; şifre gerekmez.
 */
export async function sendLoginLink(email: string) {
  await sendSignInLinkToEmail(auth, email, { url: `${window.location.origin}/`, handleCodeInApp: true });
  try { localStorage.setItem(LINK_EMAIL_KEY, email); } catch { /* yok say */ }
}

/** Sayfa bir giriş bağlantısıyla mı açıldı? */
export const isLoginLink = () => isSignInWithEmailLink(auth, window.location.href);

/** Bu cihazda bağlantı istenmişse adresi döndürür. */
export function storedLinkEmail(): string | null {
  try { return localStorage.getItem(LINK_EMAIL_KEY); } catch { return null; }
}

/** Bağlantıyla girişi tamamlar ve adres çubuğunu temizler. */
export async function completeLoginLink(email: string) {
  await signInWithEmailLink(auth, email, window.location.href);
  try { localStorage.removeItem(LINK_EMAIL_KEY); } catch { /* yok say */ }
  window.history.replaceState(null, '', '/');
}

/** Instagram, Facebook, LinkedIn vb. uygulama içi tarayıcılarda Google girişi engellenir. */
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat|Twitter/i.test(ua);
}

/** Kimlik kişisel Gmail adresidir; öğrenci/kurum hesapları kabul edilmez (API de ayrıca kontrol eder). */
export function isGmail(email: string | null | undefined): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email || '');
}
