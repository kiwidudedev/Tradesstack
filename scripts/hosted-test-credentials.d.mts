export function requireHostedTestCredentials(
  role: "owner" | "manager",
  env?: Record<string, string | undefined>,
): { email: string; password: string };
