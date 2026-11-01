import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Cloud Run'da kimlik bilgisi ortamdan gelir; yerelde emülatör değişkenleri
// (FIRESTORE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST) yeterlidir.
if (!getApps().length) {
  initializeApp(process.env.GCLOUD_PROJECT ? { projectId: process.env.GCLOUD_PROJECT } : undefined);
}

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
export const auth = getAuth();
