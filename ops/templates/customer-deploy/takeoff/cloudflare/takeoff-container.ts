import { Container } from "@cloudflare/containers";

type TakeoffContainerEnv = {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  TAKEOFF_CONTAINER_TOKEN?: string;
  TAKEOFF_STORAGE_PROXY_URL?: string;
};

/** Native PDF renderer; never imported by normal web route code. */
export class TakeoffRendererContainer extends Container<TakeoffContainerEnv> {
  defaultPort = 8787;
  sleepAfter = "5m";
  requiredPorts = [8787];
  enableInternet = true;

  constructor(ctx: DurableObjectState, env: TakeoffContainerEnv) {
    super(ctx, env);
    this.envVars = {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      TAKEOFF_CONTAINER_TOKEN: env.TAKEOFF_CONTAINER_TOKEN ?? "",
      TAKEOFF_STORAGE_PROXY_URL: env.TAKEOFF_STORAGE_PROXY_URL ?? "",
      TAKEOFF_CONTAINER_RUNTIME: "1",
      NODE_ENV: "production",
      TAKEOFF_CONTAINER_MAX_JOB_SECONDS: "240",
    };
  }
}
