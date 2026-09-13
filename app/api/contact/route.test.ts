import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({ send: vi.fn(), construct: vi.fn() }));
vi.mock("resend", () => ({ Resend: class {
  emails = { send: mocked.send };
  constructor(key: string) { mocked.construct(key); }
} }));
const form = { firstName: "Test", lastName: "Person", email: "sender@example.test", phone: "123", country: "NZ", message: "Hello" };
const request = () => new Request("https://example.test/api/contact", { method: "POST", body: JSON.stringify(form) });

beforeEach(() => {
  vi.resetModules(); mocked.send.mockReset(); mocked.construct.mockReset();
  vi.stubEnv("RESEND_API_KEY", undefined);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("optional contact email service", () => {
  it("imports without a key or client initialization", async () => {
    const route = await import("./route");
    expect(route.POST).toBeTypeOf("function");
    expect(mocked.construct).not.toHaveBeenCalled();
    expect(mocked.send).not.toHaveBeenCalled();
  });
  it.each([undefined, "", "   "])("returns controlled 503 without a configured key", async (key) => {
    vi.stubEnv("RESEND_API_KEY", key);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ success: false, error: "Contact service is temporarily unavailable" });
    expect(mocked.construct).not.toHaveBeenCalled(); expect(mocked.send).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });
  it("initializes only on request and preserves the configured send payload", async () => {
    vi.stubEnv("RESEND_API_KEY", "synthetic-test-key");
    mocked.send.mockResolvedValue({ data: { id: "synthetic-message" }, error: null });
    const { POST } = await import("./route");
    expect(mocked.construct).not.toHaveBeenCalled();
    const response = await POST(request());
    expect(mocked.construct).toHaveBeenCalledWith("synthetic-test-key");
    expect(mocked.send).toHaveBeenCalledTimes(1);
    expect(mocked.send).toHaveBeenCalledWith({ from: "Corey – TradesStack <hello@mail.tradesstack.com>", to: "hi@tradesstack.com", replyTo: form.email, subject: "New Contact Form Submission", html: expect.stringContaining("<strong>Name:</strong> Test Person") });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: { id: "synthetic-message" } });
  });
  it.each(["provider error", "send throws", "constructor throws"])("does not expose details when %s", async (failure) => {
    const secret = "synthetic-private-marker";
    vi.stubEnv("RESEND_API_KEY", secret);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    if (failure === "provider error") mocked.send.mockResolvedValue({ data: null, error: { message: secret } });
    else if (failure === "send throws") mocked.send.mockRejectedValue(new Error(secret));
    else mocked.construct.mockImplementation(() => { throw new Error(secret); });
    const { POST } = await import("./route");
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false, error: "Failed to send email" });
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
});
