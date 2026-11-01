import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Yerelde /api istekleri Cloud Run yerine localhost:8080'deki API'ye gider.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
});
