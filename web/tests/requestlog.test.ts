import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

describe("requestKey", () => {
  it("normalises repos and users, rejects junk", async () => {
    const { requestKey } = await import("@/lib/requestlog");
    expect(requestKey("Vercel/Next.js")).toBe("vercel/next.js");
    expect(requestKey("user:Torvalds")).toBe("user:torvalds");
    expect(requestKey("a/b/c")).toBeNull();
    expect(requestKey("user:-bad-")).toBeNull();
    expect(requestKey("nothing")).toBeNull();
  });
});

describe("logRequest", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("is skipped without a token and makes no request", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { logRequest } = await import("@/lib/requestlog");
    expect(await logRequest("a/b")).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("appends one line through the contents API as ghostwritten-bot", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t0k");
    const calls: { url: string; init?: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (!init?.method) return new Response(JSON.stringify({ sha: "abc", content: b64("x/y\n") }), { status: 200 });
        return new Response("{}", { status: 200 });
      }),
    );
    const { logRequest } = await import("@/lib/requestlog");
    expect(await logRequest("Owner/Repo")).toBe("logged");
    const put = calls[1];
    expect(put.init?.method).toBe("PUT");
    const body = JSON.parse(put.init!.body as string);
    expect(Buffer.from(body.content, "base64").toString()).toBe("x/y\nowner/repo\n");
    expect(body.sha).toBe("abc");
    expect(body.message).toBe("[skip ci] request");
    expect(body.committer).toEqual({ name: "ghostwritten-bot", email: "bot@ghostwritten.dev" });
    expect((put.init!.headers as Record<string, string>).Authorization).toBe("Bearer t0k");
  });

  it("debounces the same key within a day and skips keys already in the file", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t0k");
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      init?.method ? new Response("{}", { status: 200 }) : new Response(JSON.stringify({ sha: "s", content: b64("seen/it\n") }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { logRequest } = await import("@/lib/requestlog");
    expect(await logRequest("seen/it")).toBe("duplicate"); // already in file
    const n = fetchMock.mock.calls.length;
    expect(await logRequest("seen/it")).toBe("duplicate"); // debounced, no new request
    expect(fetchMock.mock.calls.length).toBe(n);
  });

  it("fails silently when GitHub errors", async () => {
    vi.stubEnv("GITHUB_TOKEN", "t0k");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 500 })));
    const { logRequest } = await import("@/lib/requestlog");
    await expect(logRequest("a/b")).resolves.toBe("failed");
  });
});
