/** Browser-side API client: everything goes through the same-origin BFF. */

export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  constructor(
    public status: number,
    public error: ApiError
  ) {
    super(error.message);
  }
}

/**
 * A 401 `unauthorized` from the BFF means the session is gone, not that the call was
 * wrong: the `bt_token` cookie outlived its 115 minutes (the backend then answers
 * "missing bearer token") or the JWT no longer verifies. Other 401s, such as
 * `invalid_credentials` for a wrong password, are the caller's to show.
 */
function isSessionLost(path: string, status: number, error: ApiError): boolean {
  return (
    status === 401 &&
    error.code === "unauthorized" &&
    path.startsWith("/api/backend/")
  );
}

/**
 * Send the visitor to sign in again and back here afterwards, as the middleware does on
 * navigation. A page left open past the cookie's lifetime never navigates, so without
 * this every call (the builder's autosave included) fails with the raw backend message.
 */
function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const { pathname, search } = window.location;
  if (pathname === "/login") return;
  const login = new URLSearchParams({ from: pathname + search });
  // A full load on purpose: no router out here, and the cache of the lost session goes.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign(`/login?${login}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    let error: ApiError = { code: "unknown", message: response.statusText };
    try {
      const body = await response.json();
      if (body?.error) error = body.error;
    } catch {
      /* non-JSON error body */
    }
    if (isSessionLost(path, response.status, error)) redirectToLogin();
    throw new ApiRequestError(response.status, error);
  }
  // 204 No Content (e.g. storing a session's plan) has no body to parse.
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

/** Per-call options for writes. */
export interface WriteOptions {
  /**
   * Optimistic concurrency: the revision the caller last saw. The backend answers 409
   * `conflict` when the object changed since (e.g. an experiment draft edited in two
   * tabs, plan V3 decision V3-0004).
   */
  ifMatch?: string | number;
}

function write<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: WriteOptions = {}
): Promise<T> {
  return request<T>(`/api/backend/${path}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      options.ifMatch === undefined
        ? undefined
        : { "If-Match": String(options.ifMatch) },
  });
}

export const api = {
  get: <T>(path: string) => request<T>(`/api/backend/${path}`),
  post: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("PATCH", path, body, options),
  login: (email: string, password: string) =>
    request<{ status: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  delete: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("DELETE", path, body, options),
  logout: () =>
    request<{ status: string }>("/api/auth/logout", { method: "POST" }),
};
