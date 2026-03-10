function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.name === "AbortError";
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (init.signal) {
      if (init.signal.aborted) {
        controller.abort();
      } else {
        init.signal.addEventListener("abort", () => controller.abort(), { once: true });
      }
    }

    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Upstream request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
