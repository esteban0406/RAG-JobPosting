import { NextRequest } from "next/server";
import { backendFetch } from "@/lib/backend-fetch";

// Single proxy for every authenticated client-side call. The browser only ever
// talks same-origin to this route; backendFetch is what actually attaches
// (and silently refreshes) the access token when calling the real backend —
// the browser never holds or sends that token itself.
async function proxy(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await params;
  const pathname = `/${path.join("/")}`;
  const search = request.nextUrl.search;

  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const accept = request.headers.get("accept");
  if (accept) headers.set("Accept", accept);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const isMultipart = contentType?.startsWith("multipart/form-data") ?? false;

  let init: RequestInit;
  if (!hasBody) {
    init = { method: request.method, headers };
  } else if (isMultipart) {
    // Large file upload — stream straight through instead of buffering it in
    // memory. A streamed body can't be replayed, so this specific request
    // can't be silently retried after a token refresh (the rare 401 here
    // just surfaces to the user, who can retry the upload).
    init = {
      method: request.method,
      headers,
      body: request.body,
      duplex: "half",
    } as RequestInit;
  } else {
    // Buffer everything else (small JSON/text bodies) so a 401 can be
    // transparently retried after a silent refresh.
    init = { method: request.method, headers, body: await request.text() };
  }

  try {
    const res = await backendFetch(`${pathname}${search}`, init);

    const responseHeaders = new Headers();
    for (const key of ["content-type", "cache-control"]) {
      const value = res.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }

    return new Response(res.body, {
      status: res.status,
      headers: responseHeaders,
    });
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "Unexpected error";
    return Response.json({ message }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
