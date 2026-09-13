export function requireLocalTestPassword(
  env: Record<string, string | undefined> = process.env,
): string {
  const password = env.LOCAL_E2E_OWNER_PASSWORD;
  if (!password?.trim()) {
    throw new Error("Missing required environment variable: LOCAL_E2E_OWNER_PASSWORD");
  }
  return password;
}
