/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    // Fail loudly instead of silently hopping ports (breaks launcher health check)
    strictPort: true,
    proxy: {
      '/api': {
        // `127.0.0.1`, never `localhost`. The backend binds the IPv4 loopback
        // (see launcher/config.json), and `localhost` resolves to ::1 first on
        // any IPv6-preferring host -- which makes every proxied request fail
        // with ECONNREFUSED while the backend is plainly up. Naming the address
        // the server actually binds removes that whole class of failure.
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // Backend restarts must not crash the dev server (ECONNREFUSED).
        configure: (proxy) => {
          proxy.on('error', (err) => {
            const code = (err as NodeJS.ErrnoException).code ?? err.message;
            console.warn(
              `[vite] Could not reach the backend on 127.0.0.1:8000 (${code}). ` +
                'It is probably still starting or restarting — this clears on its own. ' +
                'If it persists, run `ecomind check` or read logs/backend.log.',
            );
          });
        },
      },
      '/ws': {
        target: 'ws://127.0.0.1:8000',
        ws: true,
        // Without this handler an unhandled 'error' event kills Vite when the
        // backend bounces while the dashboard holds an open WebSocket.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            const code = (err as NodeJS.ErrnoException).code ?? err.message;
            console.warn(
              `[vite] Backend event stream unavailable (${code}). The page reconnects ` +
                'on its own; see logs/backend.log if it does not recover.',
            );
          });
        },
      },
    },
  },
  test: {
    /*
     * Node stays the default because the pure-logic suites (scales, formatters,
     * routing) are the majority and jsdom is roughly an order of magnitude
     * slower to boot. A test that needs a DOM opts in with a
     * `@vitest-environment jsdom` docblock rather than paying for it twice.
     */
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/lib/__tests__/setup.dom.ts'],
    globals: true,
  },
});
