import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Frontend leży w katalogu client/, a wynik budowania trafia do dist/ (serwuje go Express).
export default defineConfig(({ mode }) => {
  // Port serwera API bierzemy z tego samego pliku .env, z którego korzysta backend.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const apiPort = env.PORT || 3000;

  return {
    root: 'client',
    plugins: [react(), tailwindcss()],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      // W trybie deweloperskim żądania do API są przekazywane do serwera Express.
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  };
});
