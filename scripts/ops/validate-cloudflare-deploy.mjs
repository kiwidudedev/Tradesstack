import process from "node:process";

const alphaProjectReference = "ibjyzpyuqupsxqakpzxj";
const deploymentEnvironment = process.env.CLOUDFLARE_ENV?.trim();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!deploymentEnvironment) {
  throw new Error("CLOUDFLARE_ENV is required. Use alpha for the Alpha deployment.");
}

if (deploymentEnvironment !== "alpha") {
  throw new Error(`Unsupported Cloudflare deployment environment: ${deploymentEnvironment}`);
}

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Alpha Cloudflare deploy requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in the process environment. Do not rely on the hosted-development .env.local file.",
  );
}

const expectedHostname = `${alphaProjectReference}.supabase.co`;
let parsedUrl;
try {
  parsedUrl = new URL(supabaseUrl);
} catch {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL.");
}

if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== expectedHostname) {
  throw new Error(
    `Refusing Alpha deploy: NEXT_PUBLIC_SUPABASE_URL must target https://${expectedHostname}, not ${supabaseUrl}.`,
  );
}

console.log(
  JSON.stringify({
    status: "validated",
    cloudflareEnvironment: deploymentEnvironment,
    supabaseProjectReference: alphaProjectReference,
    supabaseAnonKeyPresent: true,
  }),
);
