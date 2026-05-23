// API base URL resolution order:
//   1. localStorage["resq.apiBaseOverride"] — runtime override, lets a phone
//      paste any base URL (prod, ngrok tunnel, etc.) without rebuilding.
//      Highest priority so it always wins when set.
//   2. NEXT_PUBLIC_API_URL if set (production build-time override)
//   3. window.location.hostname:4000 (dev — works for localhost AND for a
//      phone hitting the dev box over LAN via 192.168.x.y:3000)
//   4. http://localhost:4000 (SSR / no window)
const API_OVERRIDE_KEY = "resq.apiBaseOverride";

function readOverride(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(API_OVERRIDE_KEY);
    return v && v.trim().length > 0 ? v.trim() : null;
  } catch {
    return null;
  }
}

function resolveApiUrl(): string {
  const override = readOverride();
  if (override) return override;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
}

// Resolved once per JS chunk load. The override popover triggers a full
// page reload after saving so this stays in sync — keeps the call cheap
// and avoids passing a "current URL" through every component.
export const apiUrl: string = resolveApiUrl();

// Settings helpers for the simulator's override popover. Reload after
// either, because socket.io connections + the cached `apiUrl` above won't
// repick the new value otherwise.
export function setApiBaseOverride(url: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (url && url.trim().length > 0) {
      window.localStorage.setItem(API_OVERRIDE_KEY, url.trim());
    } else {
      window.localStorage.removeItem(API_OVERRIDE_KEY);
    }
  } catch {
    /* localStorage disabled */
  }
}

export function getApiBaseOverride(): string | null {
  return readOverride();
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface PingResult {
  ok: boolean;
  url: string;
  status?: number;
  error?: string;
  latencyMs?: number;
}

// Health probe for the diagnostic banner on the simulator. AbortController
// caps the wait at 3 s so a dead host doesn't hold up the UI. We always
// echo the resolved URL so callers can show "API unreachable at <url>".
export async function pingApi(): Promise<PingResult> {
  const url = apiUrl;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${url}/healthz`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    return {
      ok: res.ok,
      url,
      status: res.status,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      url,
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}
