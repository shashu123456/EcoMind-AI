# EcoMind AI — frontend

React 19 + TypeScript SPA, built with Vite, managed with **pnpm**.

- `client/src/` — the app: `components/shell/AppShell.tsx` (single shell, 14 views),
  `lib/api.ts` (REST client for FastAPI), `lib/workspace.ts` (live-data loader
  mapping backend payloads into every view)
- `shared/` — shared constants
- `vite.config.ts` — builds to `dist/`, which the FastAPI backend serves at
  `http://127.0.0.1:8000`. `vite.config` also proxies `/api` → `:8000` in dev.

```bash
pnpm install       # once
pnpm check         # tsc --noEmit
pnpm build:static  # production build → dist/
pnpm dev:static    # HMR dev server on :5173 (proxies /api to :8000)
```

The backend serves the built SPA, so in normal use you never run the dev
server — only when you want hot reload while editing.

See `../docs/STATUS.md` for what is built, broken, and next.
