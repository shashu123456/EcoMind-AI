/** `/health` — unauthenticated liveness probe. */

import { request } from './client';
import type { HealthPayload } from './types';

export function check(): Promise<HealthPayload> {
  return request<HealthPayload>('/health', { anonymous: true });
}
