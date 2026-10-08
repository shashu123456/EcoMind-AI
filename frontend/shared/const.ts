/** Shared constants used by client code and any server glue. */

export const COOKIE_NAME = "ecomind_session";
export const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
export const OAUTH_STATE_COOKIE = "ecomind_oauth_state";
export const UNAUTHED_ERR_MSG = "UNAUTHORIZED";

export function encodeOAuthState(payload: { redirectUri: string; nonce: string }): string {
  return btoa(JSON.stringify(payload));
}

export function decodeOAuthState(state: string): { redirectUri: string; nonce: string } | null {
  try {
    return JSON.parse(atob(state));
  } catch {
    return null;
  }
}
