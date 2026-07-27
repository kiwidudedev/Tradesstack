import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;

export function parseXeroEncryptionKey(value: string) {
  const trimmed = value.trim();

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length === 32) {
    return decoded;
  }

  throw new Error("XERO_TOKEN_ENCRYPTION_KEY must be a 32-byte base64 string or 64-char hex string.");
}

export function hashXeroOAuthState(state: string) {
  return createHash("sha256").update(state).digest("hex");
}

export function createRandomXeroState() {
  return randomBytes(32).toString("base64url");
}

export function encryptJsonValue(value: unknown, keyValue: string) {
  const key = parseXeroEncryptionKey(keyValue);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptJsonValue<T>(ciphertext: string, keyValue: string): T {
  const key = parseXeroEncryptionKey(keyValue);
  const payload = Buffer.from(ciphertext, "base64");

  if (payload.length <= IV_LENGTH_BYTES + 16) {
    throw new Error("Encrypted Xero token payload is malformed.");
  }

  const iv = payload.subarray(0, IV_LENGTH_BYTES);
  const tag = payload.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
  const encrypted = payload.subarray(IV_LENGTH_BYTES + 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");

  return JSON.parse(plaintext) as T;
}
