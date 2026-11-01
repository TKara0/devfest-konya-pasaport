import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  setPersistence,
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

/** Instagram, Facebook, LinkedIn vb. uygulama içi tarayıcılarda Google girişi engellenir. */
export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || '';
  return /Instagram|FBAN|FBAV|FB_IAB|LinkedInApp|Line\/|MicroMessenger|TikTok|musical_ly|Snapchat|Twitter/i.test(ua);
}

/** Kimlik kişisel Gmail adresidir; öğrenci/kurum hesapları kabul edilmez (API de ayrıca kontrol eder). */
export function isGmail(email: string | null | undefined): boolean {
  return /@(gmail|googlemail)\.com$/i.test(email || '');
}
