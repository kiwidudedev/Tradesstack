import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { Buffer } from "buffer";

type Database = Record<string, unknown>;

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Supabase env vars are missing. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
}

const ACCESS_TOKEN_KEY = "sb-access-token";
const REFRESH_TOKEN_KEY = "sb-refresh-token";
const MAX_SECURESTORE_SIZE = 2048;

const decodeJwtPayload = (token: string) => {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;
    const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const decoder =
      typeof globalThis.atob === "function"
        ? globalThis.atob
        : (input: string) => Buffer.from(input, "base64").toString("binary");
    const json = decoder(padded);
    return JSON.parse(json) as {
      exp?: number;
      sub?: string;
      aud?: string;
      role?: string;
      email?: string;
      phone?: string;
      app_metadata?: Record<string, unknown>;
      user_metadata?: Record<string, unknown>;
      created_at?: string;
    };
  } catch {
    return null;
  }
};

const buildSessionPayload = (accessToken: string, refreshToken: string) => {
  const payload = decodeJwtPayload(accessToken);
  const now = Math.floor(Date.now() / 1000);
  const exp = payload?.exp ?? now + 3600;
  const expiresIn = Math.max(exp - now, 0);
  const userId = payload?.sub ?? null;

  return JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: exp,
    user: userId
      ? {
          id: userId,
          aud: payload?.aud ?? "authenticated",
          role: payload?.role ?? "authenticated",
          email: payload?.email ?? null,
          phone: payload?.phone ?? null,
          app_metadata: payload?.app_metadata ?? {},
          user_metadata: payload?.user_metadata ?? {},
          created_at: payload?.created_at ?? new Date(0).toISOString()
        }
      : null
  });
};

const secureStoreAdapter = {
  getItem: async (_key: string) => {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(REFRESH_TOKEN_KEY)
    ]);
    if (!accessToken || !refreshToken) return null;
    return buildSessionPayload(accessToken, refreshToken);
  },
  setItem: async (_key: string, value: string) => {
    let accessToken: string | null = null;
    let refreshToken: string | null = null;
    try {
      const parsed = JSON.parse(value ?? "{}") as {
        access_token?: string;
        refresh_token?: string;
      };
      accessToken = parsed.access_token ?? null;
      refreshToken = parsed.refresh_token ?? null;
    } catch {
      return;
    }
    if (!accessToken || !refreshToken) return;

    if (accessToken.length > MAX_SECURESTORE_SIZE || refreshToken.length > MAX_SECURESTORE_SIZE) {
      console.warn("SecureStore token size exceeds 2048 bytes; skipping persistence.");
      return;
    }

    await Promise.all([
      SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken),
      SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken)
    ]);
  },
  removeItem: async (_key: string) => {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY)
    ]);
  }
};

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false
  }
});
