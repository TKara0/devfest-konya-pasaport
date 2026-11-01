import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// DEMO MODU: Firebase yerine sahte giriş (src/dev/fake-firebase.ts),
// API olarak `api` klasöründeki `npm run demo` sunucusu (localhost:8080).
const fake = fileURLToPath(new URL('./src/dev/fake-firebase.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('true') },
  resolve: {
    alias: [{ find: /^firebase\/(app|auth)$/, replacement: fake }],
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080' },
  },
});
