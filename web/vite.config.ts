import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * - `npm run dev`  : web/.env içinde Firebase bilgileri varsa (ya da VITE_USE_EMULATOR=true,
 *                    ör. start.py) gerçek/emülatör girişi; yoksa otomatik DEMO modu.
 * - `npm run demo` : her zaman DEMO modu.
 * - `npm run build`: Firebase bilgileri zorunlu; demo kodu yayına asla girmez.
 * /api istekleri yerelde localhost:8080'e gider (kök klasörde `npm run demo` API'yi de açar).
 */
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const emulator = env.VITE_USE_EMULATOR === 'true';
  const hasFirebase = !!env.VITE_FIREBASE_API_KEY || emulator;

  if (command === 'build' && !env.VITE_FIREBASE_API_KEY) {
    throw new Error('VITE_FIREBASE_API_KEY tanımlı değil. web/.env dosyasını .env.example’a bakarak doldurun.');
  }

  const demo = command === 'serve' && (mode === 'demo' || !hasFirebase);
  if (demo && mode !== 'demo') {
    console.log('\n  web/.env içinde Firebase bilgisi yok → DEMO modunda açılıyor (test hesaplarıyla giriş).');
    console.log('  API için kök klasörde `npm run demo` çalıştırın.\n');
  }
  const fake = fileURLToPath(new URL('./src/dev/fake-firebase.ts', import.meta.url));

  return {
    plugins: [react()],
    define: demo ? { 'import.meta.env.VITE_DEMO': JSON.stringify('true') } : {},
    resolve: { alias: demo ? [{ find: /^firebase\/(app|auth)$/, replacement: fake }] : [] },
    server: { port: 5173, proxy: { '/api': 'http://localhost:8080' } },
  };
});
