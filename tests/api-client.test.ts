import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, isConfigured, getConfig } from "../src/api-client.js";

const cfg = { url: "http://semaphore.test", token: "test-token" };

function mockFetch(body: unknown, status = 200, contentType = "application/json") {
  const textBody = typeof body === "string" ? body : (body === null || body === undefined) ? "" : JSON.stringify(body);
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    text: () => Promise.resolve(textBody),
  });
}

describe("api()", () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it("makes GET request with auth header", async () => {
    const mock = mockFetch([{ id: 1 }]);
    vi.stubGlobal("fetch", mock);
    const result = await api("GET", "/projects", undefined, cfg);
    expect(mock).toHaveBeenCalledWith("http://semaphore.test/api/projects", {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-token" },
      body: undefined,
    });
    expect(result).toEqual([{ id: 1 }]);
  });

  it("sends JSON body on POST", async () => {
    const mock = mockFetch({ id: 1 });
    vi.stubGlobal("fetch", mock);
    await api("POST", "/project/1/tasks", { template_id: 5 }, cfg);
    expect(mock.mock.calls[0][1].body).toBe('{"template_id":5}');
  });

  it("returns text for non-JSON responses", async () => {
    vi.stubGlobal("fetch", mockFetch("pong", 200, "text/plain"));
    const result = await api("GET", "/ping", undefined, cfg);
    expect(result).toBe("pong");
  });

  it("throws on HTTP error with status and body", async () => {
    vi.stubGlobal("fetch", mockFetch("Unauthorized", 401, "text/plain"));
    await expect(api("GET", "/projects", undefined, cfg)).rejects.toThrow("GET /projects → 401: Unauthorized");
  });

  it("throws on network failure with URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(api("GET", "/projects", undefined, cfg)).rejects.toThrow("Failed to connect to http://semaphore.test: ECONNREFUSED");
  });

  it("returns null for empty JSON response body (PUT/DELETE)", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 200, "application/json"));
    const result = await api("DELETE", "/project/1/templates/5", undefined, cfg);
    expect(result).toBeNull();
  });

  it("returns null for empty body on successful PUT", async () => {
    vi.stubGlobal("fetch", mockFetch(null, 200, "application/json"));
    const result = await api("PUT", "/project/1/environment/3", { name: "test" }, cfg);
    expect(result).toBeNull();
  });
});

describe("isConfigured()", () => {
  it("returns true when token is set", () => {
    expect(isConfigured({ url: "", token: "abc" })).toBe(true);
  });

  it("returns false when token is empty", () => {
    expect(isConfigured({ url: "", token: "" })).toBe(false);
  });
});

describe("getConfig()", () => {
  it("reads from env vars", () => {
    vi.stubEnv("SEMAPHORE_URL", "http://my-host:3000");
    vi.stubEnv("SEMAPHORE_API_TOKEN", "my-token");
    const c = getConfig();
    expect(c.url).toBe("http://my-host:3000");
    expect(c.token).toBe("my-token");
    vi.unstubAllEnvs();
  });

  it("strips trailing slashes from URL", () => {
    vi.stubEnv("SEMAPHORE_URL", "http://host:3000///");
    expect(getConfig().url).toBe("http://host:3000");
    vi.unstubAllEnvs();
  });

  it("uses defaults when env vars are unset", () => {
    vi.stubEnv("SEMAPHORE_URL", "");
    vi.stubEnv("SEMAPHORE_API_TOKEN", "");
    const c = getConfig();
    expect(c.url).toBe("http://localhost:3000");
    expect(c.token).toBe("");
    vi.unstubAllEnvs();
  });
});
