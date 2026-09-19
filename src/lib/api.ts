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
    throw new ApiRequestError(response.status, error);
  }
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
