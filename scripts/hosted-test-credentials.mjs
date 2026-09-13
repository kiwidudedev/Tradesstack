/** Hosted test accounts only. Does not read files, authenticate, or log values. */
export function requireHostedTestCredentials(role, env = process.env) {
  if (role !== "owner" && role !== "manager") {
    throw new Error("Unsupported hosted-test account role.");
  }
  const prefix = `HOSTED_TEST_${role.toUpperCase()}`;
  const emailName = `${prefix}_EMAIL`;
  const passwordName = `${prefix}_PASSWORD`;
  const email = env[emailName];
  const password = env[passwordName];
  if (!email?.trim()) throw new Error(`Missing required environment variable: ${emailName}`);
  if (!password?.trim()) throw new Error(`Missing required environment variable: ${passwordName}`);
  // Preserve the password exactly, including any intentional surrounding whitespace.
  return { email: email.trim().toLowerCase(), password };
}
