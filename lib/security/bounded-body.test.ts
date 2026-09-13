import { describe, expect, it } from "vitest";
import { readBoundedBody, RequestBodyTooLargeError } from "./bounded-body";
describe("actual request byte limits", () => {
  it.each([undefined, "1"])("rejects streamed overflow with Content-Length %s", async (length) => {
    const request = new Request("https://example.test", { method: "POST", body: "123456", headers: length ? { "content-length": length } : {} });
    await expect(readBoundedBody(request, 5)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
  it("preserves bytes at the boundary", async () => {
    const body = await readBoundedBody(new Request("https://example.test", { method: "POST", body: "abcde" }), 5);
    expect(new TextDecoder().decode(body)).toBe("abcde");
  });
  it("rejects an oversized declared body before reading", async () => {
    await expect(readBoundedBody(new Request("https://example.test", { method: "POST", headers: { "content-length": "999" } }), 5)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
