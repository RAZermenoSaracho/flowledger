/** Base URL of the API, from `VITE_API_URL` or a localhost fallback. */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";
const TOKEN_KEY = "flowledger.token";

/** localStorage-backed getter/setter/clearer for the auth token. */
export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY)
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

/** Generic authenticated fetch wrapper used by every `<module>.client.ts` function; attaches the bearer token and throws `ApiError` on non-2xx responses. */
export async function apiRequest<T>(
  path: string,
  options: ApiOptions = {}
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
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: requestBody
  });

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
