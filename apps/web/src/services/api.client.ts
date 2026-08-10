/** Base URL of the API, from `VITE_API_URL` or a localhost fallback. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

let accessToken: string | null = null;

/**
 * In-memory getter/setter/clearer for the access token. Deliberately not
 * persisted to `localStorage`/`sessionStorage` — a page reload always starts
 * from `null`, and the caller (`AuthProvider`) is responsible for restoring a
 * session via a silent `/auth/refresh` call against the httpOnly refresh
 * cookie.
 */
export const tokenStore = {
  get: () => accessToken,
  set: (token: string) => {
    accessToken = token;
  },
  clear: () => {
    accessToken = null;
  }
};

/** Error subclass carrying the parsed error response body from a failed API request. */
export class ApiError extends Error {
  constructor(
    message: string,
    public body?: unknown
  ) {
    super(message);
  }
}

type ApiOptions = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

/** Resolves a possibly-relative asset path against the API base URL; passes absolute URLs through unchanged. */
export function apiAssetUrl(path: string | null | undefined) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Resolves a path against the API base URL. */
export function apiUrl(path: string) {
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

let refreshPromise: Promise<boolean> | null = null;

/**
 * Attempts to obtain a fresh access token from the httpOnly refresh cookie
 * via `POST /auth/refresh`, storing it in `tokenStore` on success. Uses a
 * raw `fetch` (not `apiRequest`) so it can never recurse into itself, and
 * de-dupes concurrent callers onto a single in-flight request.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include"
    })
      .then(async (response) => {
        if (!response.ok) return false;
        const data = (await response.json()) as { token: string };
        tokenStore.set(data.token);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

/**
 * Generic authenticated fetch wrapper used by every `<module>.client.ts`
 * function; attaches the bearer token, sends/receives the httpOnly refresh
 * cookie, and throws `ApiError` on non-2xx responses. On a 401 from any
 * non-`/auth` path, attempts one silent token refresh and retries the
 * request before giving up.
 */
export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {},
  isRetry = false
): Promise<T> {
  const url = new URL(`${API_URL}${path}`);

  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item) url.searchParams.append(key, item);
      }
      continue;
    }

    if (value) url.searchParams.set(key, value);
  }

  const token = tokenStore.get();
  const isFormData = options.body instanceof FormData;
  const requestBody: BodyInit | undefined =
    options.body instanceof FormData
      ? options.body
      : options.body
        ? JSON.stringify(options.body)
        : undefined;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: requestBody
  });

  if (response.status === 401 && !isRetry && !path.startsWith("/auth/")) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return apiRequest<T>(path, options, true);
    }
  }

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new ApiError(errorBody?.message ?? "Request failed", errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
