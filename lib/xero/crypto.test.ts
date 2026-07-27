import { describe, expect, it } from "vitest";
import { createRandomXeroState, decryptJsonValue, encryptJsonValue, hashXeroOAuthState, parseXeroEncryptionKey } from "@/lib/xero/crypto";

const KEY = Buffer.alloc(32, 7).toString("base64");

describe("xero crypto helpers", () => {
  it("round-trips encrypted json", () => {
    const value = {
      access_token: "access",
      refresh_token: "refresh",
      expires_at: "2026-07-15T00:00:00.000Z",
    };

    const encrypted = encryptJsonValue(value, KEY);
    expect(encrypted).not.toContain("access");
    expect(decryptJsonValue(encrypted, KEY)).toEqual(value);
  });

  it("hashes oauth state deterministically", () => {
    expect(hashXeroOAuthState("abc")).toBe(hashXeroOAuthState("abc"));
    expect(hashXeroOAuthState("abc")).not.toBe(hashXeroOAuthState("def"));
  });

  it("creates opaque random oauth states", () => {
    expect(createRandomXeroState()).not.toBe(createRandomXeroState());
  });

  it("rejects malformed encryption keys", () => {
    expect(() => parseXeroEncryptionKey("short")).toThrow(/XERO_TOKEN_ENCRYPTION_KEY/);
  });
});
