/**
 * Shared setup for component tests.
 *
 * Registered globally so a spec never has to remember the import. The jest-dom
 * matchers are what let assertions read as behaviour ("the meter is exposed as
 * 0.62") rather than as attribute archaeology ("aria-valuenow is '62'").
 *
 * This file runs under the default `node` environment too, so every import here
 * must be safe without a DOM. `expect.extend` and the matcher registration are
 * both harmless there; anything touching `document` is not, which is why the
 * cleanup hook below guards on its presence.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// React Testing Library does not auto-clean when `globals` is on in every vitest
// version; unmounting explicitly stops a spec's DOM leaking into the next one.
afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});
