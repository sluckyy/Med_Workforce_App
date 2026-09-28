import { getApiBaseUrl } from "../config.js";

// Tokens live in localStorage for simplicity (this is a pilot/co-design
// demonstrator, not a hardened deployment — see README "Status" and
// docs/addendum/v0.3-addendum.md §6). localStorage is readable by any
// script on the page, so a real deployment should move the refresh token
// to an httpOnly cookie before any real practitioner data goes near this.
const ACCESS_TOKEN_KEY = "medworkforce.accessToken";
const REFRESH_TOKEN_KEY = "medworkforce.refreshToken";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setSession(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearSession() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(typeof body === "object" && body && "error" in body ? String((body as { error: unknown }).error) : `Request failed (${status})`);
  }
}

async function rawFetch(path: string, options: RequestInit, accessToken: string | null) {
  const headers = new Headers(options.headers);
  // Only set this when there's actually a body — Fastify's JSON body
  // parser rejects an empty body sent with Content-Type: application/json
  // (FST_ERR_CTP_EMPTY_JSON_BODY), which broke every body-less action
  // (approve, publish, suspend, withdraw, ...) until caught by browser
  // testing rather than just curl (curl/requests don't set this header
  // unless a body is actually given).
  if (options.body) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  return fetch(`${getApiBaseUrl()}${path}`, { ...options, headers });
}

async function tryRefresh(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  const res = await rawFetch(
    "/v1/auth/refresh",
    { method: "POST", body: JSON.stringify({ refreshToken }) },
    null,
  );
  if (!res.ok) {
    clearSession();
    return null;
  }
  const data = (await res.json()) as { accessToken: string; refreshToken: string };
  setSession(data.accessToken, data.refreshToken);
  return data.accessToken;
}

// Authenticated request helper: attaches the access token, and on a 401
// (expired access token) transparently refreshes and retries exactly once
// before giving up. Callers never see the refresh happen.
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let accessToken = getAccessToken();
  let res = await rawFetch(path, options, accessToken);

  if (res.status === 401 && accessToken) {
    accessToken = await tryRefresh();
    if (accessToken) {
      res = await rawFetch(path, options, accessToken);
    }
  }

  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // non-JSON error body; leave body null
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
