// API base URL resolution order:
//   1. NEXT_PUBLIC_API_URL if set (production / explicit override)
//   2. window.location.hostname:4000 (dev — works for localhost AND for a
//      phone hitting the dev box over LAN via 192.168.x.y:3000)
//   3. http://localhost:4000 (SSR / no window)
const API_URL: string = (() => {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window.location?.hostname) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }
  return "http://localhost:4000";
})();

export async function api<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
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

export const apiUrl = API_URL;
