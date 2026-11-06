import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  isSignInWithEmailLink,
  sendSignInLinkToEmail,
  setPersistence,
  signInWithEmailLink,
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

/** Kimlik kişisel Gmail adresidir; öğrenci/kurum hesapları kabul edilmez (API de ayrıca kontrol eder). */
export function isGmail(email: string | null | undefined): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email || '');
}
