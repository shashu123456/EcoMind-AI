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
        target: 'http://localhost:8000',
        changeOrigin: true,
        // Backend restarts must not crash the dev server (ECONNREFUSED).
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn(
              '[vite] /api proxy error (backend restarting?):',
              (err as NodeJS.ErrnoException).code ?? err.message,
            );
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
        // Without this handler an unhandled 'error' event kills Vite when the
        // backend bounces while the dashboard holds an open WebSocket.
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.warn(
              '[vite] /ws proxy error (backend restarting?):',
              (err as NodeJS.ErrnoException).code ?? err.message,
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
