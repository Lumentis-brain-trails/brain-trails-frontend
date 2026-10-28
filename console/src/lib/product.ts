/**
 * The browser's client for product actions (backend OPS-0002): every call goes to the
 * console's BFF at `/api/product/...`, which forwards it to the product API with the
 * person's own product token. The product checks `platform#admin` and writes its
 * `audit_log` row naming the person, exactly as when the pages lived in the user app.
 *
 * It has the shape of the product's `api` client (`@/lib/api`) and throws its
 * `ApiRequestError`, so the pages moved from the user app's `/admin` in sprint O2 keep
 * their calls and their error messages unchanged.
 *
 * The product token lives 115 minutes, the console session 12 hours: a 401 from the
 * product means the token ran out, and the person signs in again (`/login`).
 */
import { useQuery } from "@tanstack/react-query";
import { type ApiError, ApiRequestError, type WriteOptions } from "@/lib/api";
import type { components } from "@/lib/api-types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/product/${path}`, {
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
    if (response.status === 401 && typeof window !== "undefined") {
      // A module has no router, and the session is gone: a full load of the sign-in.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/login";
    }
    throw new ApiRequestError(response.status, error);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

function write<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  options: WriteOptions = {}
): Promise<T> {
  return request<T>(path, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers:
      options.ifMatch === undefined
        ? undefined
        : { "If-Match": String(options.ifMatch) },
  });
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("POST", path, body, options),
  put: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("PUT", path, body, options),
  patch: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("PATCH", path, body, options),
  delete: <T>(path: string, body?: unknown, options?: WriteOptions) =>
    write<T>("DELETE", path, body, options),
};

type ProductConfig = components["schemas"]["ConfigOut"];
export type ProductFeature = keyof ProductConfig["features"] & string;

/**
 * Whether a product flag is on in this environment (`GET /config` of the product). As
 * in the product, `false` while loading or on failure: an unknown state hides.
 */
export function useProductFeature(name: ProductFeature): boolean {
  const config = useQuery({
    queryKey: ["product-config"],
    queryFn: () => api.get<ProductConfig>("config"),
  });
  return config.data?.features?.[name] === true;
}
