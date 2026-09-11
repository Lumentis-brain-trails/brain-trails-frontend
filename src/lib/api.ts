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

export const api = {
  get: <T>(path: string) => request<T>(`/api/backend/${path}`),
  post: <T>(path: string, body?: unknown) =>
    request<T>(`/api/backend/${path}`, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  login: (email: string, password: string) =>
    request<{ status: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  delete: <T>(path: string, body?: unknown) =>
    request<T>(`/api/backend/${path}`, {
      method: "DELETE",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  logout: () =>
    request<{ status: string }>("/api/auth/logout", { method: "POST" }),
};
