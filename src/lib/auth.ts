// Cookie helpers for Spotify OAuth tokens.
// Tokens are stored in httpOnly cookies. Access tokens expire in ~1hr; we refresh
// them server-side using the refresh token whenever they're stale.

import { cookies } from "next/headers";

const ACCESS_COOKIE = "sp_at";
const REFRESH_COOKIE = "sp_rt";
const EXPIRES_COOKIE = "sp_exp";
const STATE_COOKIE = "sp_state";

const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

const isProd = process.env.NODE_ENV === "production";

const baseCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: isProd,
  path: "/",
};

export async function setAuthCookies(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds from now
}) {
  const store = await cookies();
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    maxAge: tokens.expiresIn,
  });
  store.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseCookie,
    maxAge: ONE_YEAR_SEC,
  });
  store.set(EXPIRES_COOKIE, String(expiresAt), {
    ...baseCookie,
    maxAge: ONE_YEAR_SEC,
  });
}

export async function updateAccessTokenCookies(tokens: {
  accessToken: string;
  expiresIn: number;
  refreshToken?: string;
}) {
  const store = await cookies();
  const expiresAt = Date.now() + tokens.expiresIn * 1000;
  store.set(ACCESS_COOKIE, tokens.accessToken, {
    ...baseCookie,
    maxAge: tokens.expiresIn,
  });
  store.set(EXPIRES_COOKIE, String(expiresAt), {
    ...baseCookie,
    maxAge: ONE_YEAR_SEC,
  });
  if (tokens.refreshToken) {
    store.set(REFRESH_COOKIE, tokens.refreshToken, {
      ...baseCookie,
      maxAge: ONE_YEAR_SEC,
    });
  }
}

export async function getAuthCookies() {
  const store = await cookies();
  const accessToken = store.get(ACCESS_COOKIE)?.value;
  const refreshToken = store.get(REFRESH_COOKIE)?.value;
  const expiresAtRaw = store.get(EXPIRES_COOKIE)?.value;
  if (!accessToken || !refreshToken) return null;
  const expiresAt = expiresAtRaw ? Number(expiresAtRaw) : 0;
  return { accessToken, refreshToken, expiresAt };
}

export async function clearAuthCookies() {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  store.delete(EXPIRES_COOKIE);
}

export async function setStateCookie(state: string) {
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    ...baseCookie,
    maxAge: 60 * 10, // 10 min
  });
}

export async function consumeStateCookie(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(STATE_COOKIE)?.value ?? null;
  store.delete(STATE_COOKIE);
  return value;
}
