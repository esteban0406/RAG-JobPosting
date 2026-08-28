// Every call here targets our own same-origin proxy (app/api/backend/[...path]),
// never the backend directly — see lib/backend-fetch.ts for why.
const API_BASE = "/api/backend";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchApi<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
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
      // ignore JSON parse errors
    }
    throw new ApiError(res.status, message);
  }

  const raw = await res.text();
  if (!raw) return undefined as T;
  return JSON.parse(raw) as T;
}

export interface StreamSearchEvent {
  type: "start" | "token" | "done" | "error";
  queryType?: string;
  content?: string;
  sources?: { jobId: string; title: string; company: string; url: string; similarity: number }[];
  status?: number;
  message?: string;
}

export interface ChatHistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export async function* streamSearch(
  body: {
    query: string;
    contextJobIds?: string[];
    history?: ChatHistoryMessage[];
  },
): AsyncGenerator<StreamSearchEvent> {
  const res = await fetch(`${API_BASE}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const raw = await res.text();
      if (raw) {
        const parsed = JSON.parse(raw) as { message?: string };
        message = parsed.message ?? message;
      }
    } catch {
      // ignore parse errors
    }
    throw new ApiError(res.status, message);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        yield JSON.parse(trimmed) as StreamSearchEvent;
      } catch {
        // skip malformed lines
      }
    }
  }

  if (buffer.trim()) {
    try {
      yield JSON.parse(buffer.trim()) as StreamSearchEvent;
    } catch {
      // skip malformed trailing data
    }
  }
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
