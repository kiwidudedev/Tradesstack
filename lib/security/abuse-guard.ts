import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RouteGuardOptions {
  routeKey: string;
  request: Request;
  userId?: string | null;
  userPerMinute: number;
  ipPerMinute: number;
  concurrentPerUser: number;
}

interface GuardFailure {
  ok: false;
  status: number;
  error: string;
}

interface GuardSuccess {
  ok: true;
  release: () => Promise<void>;
}

export type RouteGuardResult = GuardFailure | GuardSuccess;

const WINDOW_MS = 60_000;

function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();
  if (firstForwarded) {
    return firstForwarded;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

interface LimiterRpcClient {
  rpc: (
    fn: "enforce_shared_rate_limit" | "acquire_shared_concurrency_slot" | "release_shared_concurrency_slot",
    args: Record<string, unknown>
  ) => Promise<{ data: boolean | null; error: { message: string } | null }>;
}

interface DocumentDownloadGuardRpcClient {
  rpc(
    fn: "enforce_shared_rate_limit" | "acquire_shared_concurrency_slot" | "release_shared_concurrency_slot",
    args: Record<string, unknown>,
  ): Promise<{ data: boolean | null; error: { message: string } | null }>;
  rpc(
    fn: "acquire_document_download_guard",
    args: { p_ip_subject_key: string },
  ): Promise<{
    data: Array<{
      allowed: boolean;
      rejected_by: string | null;
      ip_limit_ms: number;
      user_limit_ms: number;
      concurrency_ms: number;
    }> | null;
    error: { message: string } | null;
  }>;
}

async function enforceSharedRateLimit(
  limiterClient: LimiterRpcClient,
  routeKey: string,
  subjectKey: string,
  limit: number
): Promise<boolean | null> {
  if (limit <= 0) {
    return true;
  }

  const limiterResult = await limiterClient.rpc("enforce_shared_rate_limit", {
    p_route_key: routeKey,
    p_subject_key: subjectKey,
    p_limit: limit,
    p_window_seconds: WINDOW_MS / 1000,
  });

  if (limiterResult.error) {
    console.error("[abuse-guard] shared rate limiter failed", limiterResult.error);
    return null;
  }

  return limiterResult.data === true;
}

async function acquireSharedConcurrencySlot(
  limiterClient: LimiterRpcClient,
  routeKey: string,
  subjectKey: string,
  limit: number
): Promise<boolean | null> {
  if (limit <= 0) {
    return true;
  }

  const acquireResult = await limiterClient.rpc("acquire_shared_concurrency_slot", {
    p_route_key: routeKey,
    p_subject_key: subjectKey,
    p_limit: limit,
  });

  if (acquireResult.error) {
    console.error("[abuse-guard] shared concurrency acquire failed", acquireResult.error);
    return null;
  }

  return acquireResult.data === true;
}

async function releaseSharedConcurrencySlot(limiterClient: LimiterRpcClient, routeKey: string, subjectKey: string): Promise<void> {

  const releaseResult = await limiterClient.rpc("release_shared_concurrency_slot", {
    p_route_key: routeKey,
    p_subject_key: subjectKey,
  });

  if (releaseResult.error) {
    console.error("[abuse-guard] shared concurrency release failed", releaseResult.error);
  }
}

export async function enforceRouteGuard(options: RouteGuardOptions): Promise<RouteGuardResult> {
  const ip = getClientIp(options.request);
  const userId = options.userId?.trim() || null;
  const supabase = await createServerSupabaseClient();
  const limiterClient = supabase as unknown as LimiterRpcClient;

  const ipRateKey = `ip:${options.routeKey}:${ip}`;
  const ipAllowed = await enforceSharedRateLimit(limiterClient, options.routeKey, ipRateKey, options.ipPerMinute);
  if (ipAllowed === null) {
    return {
      ok: false,
      status: 503,
      error: "Request guard is unavailable. Please retry.",
    };
  }
  if (!ipAllowed) {
    return {
      ok: false,
      status: 429,
      error: "Too many requests. Please retry in a minute.",
    };
  }

  if (userId) {
    const userRateKey = `user:${options.routeKey}:${userId}`;
    const userAllowed = await enforceSharedRateLimit(limiterClient, options.routeKey, userRateKey, options.userPerMinute);
    if (userAllowed === null) {
      return {
        ok: false,
        status: 503,
        error: "Request guard is unavailable. Please retry.",
      };
    }
    if (!userAllowed) {
      return {
        ok: false,
        status: 429,
        error: "Too many requests. Please retry in a minute.",
      };
    }

    if (options.concurrentPerUser > 0) {
      const activeKey = `active:${options.routeKey}:${userId}`;
      const acquired = await acquireSharedConcurrencySlot(limiterClient, options.routeKey, activeKey, options.concurrentPerUser);
      if (acquired === null) {
        return {
          ok: false,
          status: 503,
          error: "Request guard is unavailable. Please retry.",
        };
      }
      if (!acquired) {
        return {
          ok: false,
          status: 429,
          error: "Too many concurrent requests. Please wait for current jobs to finish.",
        };
      }

      let released = false;
      return {
        ok: true,
        release: async () => {
          if (released) {
            return;
          }
          released = true;
          await releaseSharedConcurrencySlot(limiterClient, options.routeKey, activeKey);
        },
      };
    }
  }

  return {
    ok: true,
    release: async () => {},
  };
}

export async function enforceDocumentDownloadGuard(options: {
  request: Request;
  userId: string;
  onTiming?: (stage: "ip-rate-limit" | "user-rate-limit" | "concurrency-acquire" | "guard-rpc", durationMs: number) => void;
}): Promise<RouteGuardResult> {
  const supabase = await createServerSupabaseClient();
  const limiterClient = supabase as unknown as DocumentDownloadGuardRpcClient;
  const ipSubjectKey = `ip:document-download:${getClientIp(options.request)}`;
  const started = performance.now();
  const result = await limiterClient.rpc("acquire_document_download_guard", {
    p_ip_subject_key: ipSubjectKey,
  });
  options.onTiming?.("guard-rpc", performance.now() - started);

  const row = result.data?.[0];
  if (result.error || !row) {
    console.error("[abuse-guard] atomic document download guard failed", result.error);
    return { ok: false, status: 503, error: "Request guard is unavailable. Please retry." };
  }
  options.onTiming?.("ip-rate-limit", Number(row.ip_limit_ms));
  options.onTiming?.("user-rate-limit", Number(row.user_limit_ms));
  options.onTiming?.("concurrency-acquire", Number(row.concurrency_ms));

  if (!row.allowed) {
    return {
      ok: false,
      status: 429,
      error: row.rejected_by === "concurrency"
        ? "Too many concurrent requests. Please wait for current jobs to finish."
        : "Too many requests. Please retry in a minute.",
    };
  }

  let released = false;
  return {
    ok: true,
    release: async () => {
      if (released) return;
      released = true;
      await releaseSharedConcurrencySlot(
        limiterClient as unknown as LimiterRpcClient,
        "document-download",
        `active:document-download:${options.userId}`,
      );
    },
  };
}
