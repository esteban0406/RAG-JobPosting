const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type FetchOptions = RequestInit & {
  token?: string;
};

/**
 * Unified fetch wrapper for both server-side (token passed explicitly)
 * and client-side (credentials: 'include' so httpOnly cookie is sent automatically).
 */
export async function fetchApi<T = unknown>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { token, ...init } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const isServer = typeof window === "undefined";

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    // On the client, include the httpOnly cookie automatically.
    // On the server, we rely on the explicit `token` param.
    credentials: isServer ? "omit" : "include",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const raw = await res.text();
      if (raw) {
        const body = JSON.parse(raw) as { message?: string };
        message = body.message ?? message;
      }
    } catch {
      // ignore JSON parse errors
    }
    throw new ApiError(res.status, message);
  }

  const raw = await res.text();
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

// No Content-Type header — browser sets multipart/form-data + boundary automatically.
export async function uploadFile<T = unknown>(
  path: string,
  formData: FormData,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const raw = await res.text();
      if (raw) {
        const body = JSON.parse(raw) as { message?: string };
        message = body.message ?? message;
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }

  const raw = await res.text();
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}
