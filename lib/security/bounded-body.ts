export class RequestBodyTooLargeError extends Error {
  constructor() { super("Request body is too large."); }
}

/** Enforce actual streamed bytes; Content-Length is only an early rejection hint. */
export async function readBoundedBody(request: Request, maximumBytes: number): Promise<ArrayBuffer> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maximumBytes) throw new RequestBodyTooLargeError();
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        void reader.cancel().catch(() => {});
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body.buffer;
}
