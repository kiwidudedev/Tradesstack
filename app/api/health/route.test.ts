import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const names = [
  "TRADESSTACK_RELEASE",
  "TRADESSTACK_ENVIRONMENT_ID",
  "TRADESSTACK_SUPABASE_PROJECT_REF",
  "TRADESSTACK_SOURCE_SHA",
  "TRADESSTACK_RELEASE_FINGERPRINT",
  "TRADESSTACK_WORKER_NAME",
  "TRADESSTACK_CUSTOMER_KEY",
  "DEPLOYMENT_VERSION",
  "GIT_SHA",
] as const;
const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of names) {
    if (previous[name] === undefined) delete process.env[name];
    else process.env[name] = previous[name];
  }
});

describe("customer health/version evidence", () => {
  it("reports the customer, environment and approved release without secrets", async () => {
    process.env.TRADESSTACK_RELEASE = "1.2.5";
    process.env.TRADESSTACK_ENVIRONMENT_ID = "tradelynk-production";
    process.env.TRADESSTACK_SUPABASE_PROJECT_REF = "abcdefghij0123456789";
    process.env.TRADESSTACK_SOURCE_SHA = "68cb7d8b0be044b7bb995c3b8752f0300ca33b1b";
    process.env.TRADESSTACK_RELEASE_FINGERPRINT = "41eb30ce64c2a048bab10aba48d9b0837b430f89fa9a1d317000d6bf93bf2128";
    process.env.TRADESSTACK_WORKER_NAME = "tradesstack-tradelynk";
    process.env.TRADESSTACK_CUSTOMER_KEY = "tradelynk";

    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("x-tradesstack-release")).toBe("1.2.5");
    expect(response.headers.get("x-tradesstack-environment")).toBe("abcdefghij0123456789");
    expect(response.headers.get("x-tradesstack-environment-id")).toBe("tradelynk-production");
    expect(response.headers.get("x-tradesstack-worker")).toBe("tradesstack-tradelynk");
    expect(body).toMatchObject({
      ok: true,
      customerKey: "tradelynk",
      release: "1.2.5",
      environment: "abcdefghij0123456789",
      environmentId: "tradelynk-production",
      workerName: "tradesstack-tradelynk",
    });
    expect(JSON.stringify(body)).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE_KEY|anon_key/i);
  });

  it("fails closed when the deployment identity is missing", async () => {
    for (const name of names) delete process.env[name];
    const response = GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.release).toBe("unknown");
    expect(body.environment).toBe("unknown");
  });
});
