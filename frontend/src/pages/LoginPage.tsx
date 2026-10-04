import { useState } from 'react';
import { Navigate, useNavigate } from '@tanstack/react-router';
import { auth, errorMessage, getToken } from '../lib/api';
import { Button, Callout, Input, SegmentedControl } from '../lib/ui';

type Mode = 'signin' | 'signup';

const MODES: { value: Mode; label: string }[] = [
  { value: 'signin', label: 'Sign in' },
  { value: 'signup', label: 'Create account' },
];

function Logo({ inverted = false }: { inverted?: boolean }) {
  const ink = inverted ? '#ffffff' : 'var(--brand-ink)';
  return (
    <span className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 20 20" aria-hidden className="shrink-0">
        <rect width="20" height="20" rx="5" fill={inverted ? '#ffffff' : 'var(--brand)'} />
        <rect x="5" y="11" width="2.5" height="4" rx="1" fill={ink} />
        <rect x="8.75" y="8" width="2.5" height="7" rx="1" fill={ink} opacity="0.8" />
        <rect x="12.5" y="5" width="2.5" height="10" rx="1" fill={ink} opacity="0.6" />
      </svg>
      <span
        className="text-lg font-semibold tracking-tight"
        style={{ color: inverted ? '#ffffff' : 'var(--ink)' }}
      >
        EcoMind
      </span>
    </span>
  );
}

/** Left brand panel — desktop only. Says one thing, once. */
function BrandPanel() {
  return (
    <aside
      className="relative hidden w-[46%] max-w-[40rem] flex-col justify-between overflow-hidden p-10 lg:flex"
      style={{
        backgroundImage:
          'linear-gradient(155deg, var(--brand-active) 0%, var(--brand) 52%, #3b73f0 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #ffffff 0%, transparent 70%)' }}
      />
      <Logo inverted />

      <div className="relative max-w-sm">
        <h1 className="text-3xl font-semibold leading-tight text-white">
          Energy intelligence you can defend.
        </h1>
        <p className="mt-3 text-md leading-relaxed text-white/75">
          Ten auditable stages, from raw meter readings to a board-ready decision. Nothing is
          predicted from data that was never checked.
        </p>
      </div>

      <dl className="relative grid grid-cols-3 gap-4 border-t border-white/20 pt-5 text-white">
        {[
          { v: '10', l: 'stages' },
          { v: '2', l: 'phases' },
          { v: '100%', l: 'traceable' },
        ].map((s) => (
          <div key={s.l}>
            <dt className="num text-2xl font-semibold">{s.v}</dt>
            <dd className="text-2xs uppercase tracking-widest text-white/70">{s.l}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving here with a session means sign-in already happened.
  if (getToken()) return <Navigate to="/" replace />;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'signin') {
        await auth.login({ email: email.trim(), password });
      } else {
        await auth.register({ email: email.trim(), password, full_name: fullName.trim() });
      }
      await navigate({ to: '/' });
    } catch (err) {
      setError(errorMessage(err, 'Could not sign you in.'));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === 'signin' || fullName.trim().length > 0);

  return (
    <div className="flex min-h-full">
      <BrandPanel />

      <main className="flex min-h-full flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>

          <h2 className="text-xl font-semibold text-neutral-800">
            {mode === 'signin' ? 'Welcome back' : 'Create your account'}
          </h2>
          <p className="prose-muted mt-1 text-sm">
            {mode === 'signin'
              ? 'Sign in to continue to your workspace.'
              : 'Set up an operator account for this workspace.'}
          </p>

          <form onSubmit={(e) => void submit(e)} className="mt-6 flex flex-col gap-4">
            <SegmentedControl
              value={mode}
              onChange={(next) => {
                setMode(next);
                setError(null);
              }}
              options={MODES}
              ariaLabel="Authentication mode"
            />

            {mode === 'signup' && (
              <Input
                label="Full name"
                value={fullName}
                onChange={setFullName}
                autoComplete="name"
                required
              />
            )}

            <Input
              label="Work email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
              placeholder="you@organisation.com"
              required
            />

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
              required
            />

            {error && <Callout tone="critical">{error}</Callout>}

            <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!canSubmit}>
              {mode === 'signin' ? 'Sign in' : 'Create account'}
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-neutral-500">
            Demo workspace —{' '}
            <span className="num font-medium text-neutral-700">admin@ecomind.ai</span> ·{' '}
            <span className="num font-medium text-neutral-700">admin123</span>
          </p>
        </div>
      </main>
    </div>
  );
}
