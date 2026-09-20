import assert from "node:assert/strict";
import test from "node:test";
import {
  UpstreamError,
  classifyHttpResult,
  postForm,
  postJson,
  retryDelayMs,
  upstreamHttpError,
  withSameModelRetry,
} from "../dist/shared/http.js";

test("JSON requests serialize bodies and preserve authentication overrides", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      assert.equal(init.method, "POST");
      assert.equal(init.body, '{"prompt":"test"}');
      assert.deepEqual(init.headers, {
        Authorization: "Bearer override",
        "Content-Type": "application/json",
      });
      return Response.json({ data: [] });
    },
  );
  const result = await postJson(
    "http://example.test",
    { prompt: "test" },
    {
      apiKey: "key",
      timeoutMs: 1000,
      headers: { Authorization: "Bearer override" },
    },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.json, { data: [] });
});

test("multipart leaves boundary generation to fetch and retains non-JSON errors", async (t) => {
  const form = new FormData();
  form.append("prompt", "test");
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, init: RequestInit) => {
      assert.equal(init.body, form);
      assert.deepEqual(init.headers, { Authorization: "Bearer test-key" });
      return new Response("proxy unavailable", { status: 502 });
    },
  );
  const result = await postForm("http://example.test", form, {
    apiKey: "test-key",
    timeoutMs: 1000,
  });
  assert.deepEqual(result, {
    ok: false,
    status: 502,
    json: undefined,
    text: "proxy unavailable",
  });
});

test("shared request timeout aborts both JSON and multipart requests", async (t) => {
  // 模拟等待直到取消的网络请求，验证真实计时器与 AbortSignal 的联动。
  t.mock.method(
    globalThis,
    "fetch",
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal!.addEventListener(
          "abort",
          () => reject(new DOMException("aborted", "AbortError")),
          { once: true },
        );
      }),
  );
  const options = { apiKey: "", timeoutMs: 10 };
  await assert.rejects(
    postJson("http://example.test", {}, options),
    (error: unknown) =>
      error instanceof UpstreamError &&
      error.category === "timeout" &&
      /Request timed out after 10ms/.test(error.message),
  );
  await assert.rejects(
    postForm("http://example.test", new FormData(), options),
    (error: unknown) =>
      error instanceof UpstreamError && error.category === "timeout",
  );
});

test("classifies wrapped outer 500 / inner 503 no-capacity as capacity", () => {
  const result = {
    ok: false,
    status: 500,
    json: {
      error: {
        message:
          'host_call_failed: {\n  "error": {\n    "code": 503,\n    "message": "No capacity available for model gemini-3.1-flash-image on the server",\n    "status": "UNAVAILABLE"\n  }\n}',
      },
    },
    text: '{"error":{"message":"host_call_failed"}}',
  };
  const classified = classifyHttpResult(result);
  assert.equal(classified.category, "capacity");
  assert.equal(classified.innerStatus, 503);
  const error = upstreamHttpError(result, "POST /v1/images/generations");
  assert.equal(error.category, "capacity");
  assert.equal(error.status, 500);
  assert.equal(error.retryable, true);
  assert.match(
    error.message,
    /POST \/v1\/images\/generations failed \(500, capacity, upstream 503\): No capacity available/,
  );
});

test("classifies 429 and Retry-After as rate_limit with bounded delay", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(JSON.stringify({ error: { message: "Too many requests" } }), {
        status: 429,
        headers: { "Retry-After": "2" },
      }),
  );
  const result = await postJson("http://example.test", {}, {
    apiKey: "key",
    timeoutMs: 1000,
  });
  assert.equal(result.retryAfterMs, 2000);
  const error = upstreamHttpError(result, "POST /v1/chat/completions");
  assert.equal(error.category, "rate_limit");
  assert.equal(error.retryable, true);
  assert.equal(error.retryAfterMs, 2000);
  assert.equal(
    retryDelayMs(0, error, { maxDelayMs: 5000 }),
    2000,
  );
  assert.equal(
    retryDelayMs(0, error, { maxDelayMs: 500 }),
    500,
  );
});

test("auth policy timeout and generic http are not retryable", () => {
  const auth = upstreamHttpError(
    {
      ok: false,
      status: 401,
      json: { error: { message: "Invalid API key" } },
      text: "",
    },
    "POST /v1/images/generations",
  );
  assert.equal(auth.category, "auth");
  assert.equal(auth.retryable, false);

  const policy = upstreamHttpError(
    {
      ok: false,
      status: 400,
      json: { error: { message: "Blocked by content policy" } },
      text: "",
    },
    "POST /v1/images/generations",
  );
  assert.equal(policy.category, "policy");
  assert.equal(policy.retryable, false);

  const generic = upstreamHttpError(
    {
      ok: false,
      status: 502,
      json: undefined,
      text: "proxy unavailable",
    },
    "POST /v1/images/generations",
  );
  assert.equal(generic.category, "http");
  assert.equal(generic.retryable, false);

  const timeout = new UpstreamError("timed out", { category: "timeout" });
  const network = new UpstreamError("ECONNRESET", { category: "network" });
  assert.equal(timeout.retryable, false);
  assert.equal(network.retryable, false);
});

test("withSameModelRetry retries capacity then succeeds; skips non-retryable", async () => {
  let capacityCalls = 0;
  const sleeps: number[] = [];
  const value = await withSameModelRetry(
    async () => {
      capacityCalls += 1;
      if (capacityCalls < 3) {
        throw new UpstreamError("no capacity", {
          category: "capacity",
          status: 503,
        });
      }
      return "ok";
    },
    {
      maxRetries: 2,
      baseDelayMs: 10,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
  );
  assert.equal(value, "ok");
  assert.equal(capacityCalls, 3);
  assert.deepEqual(sleeps, [10, 20]);

  let authCalls = 0;
  await assert.rejects(
    withSameModelRetry(
      async () => {
        authCalls += 1;
        throw new UpstreamError("unauthorized", { category: "auth", status: 401 });
      },
      { maxRetries: 2, sleep: async () => {} },
    ),
    (error: unknown) =>
      error instanceof UpstreamError && error.category === "auth",
  );
  assert.equal(authCalls, 1);

  let timeoutCalls = 0;
  await assert.rejects(
    withSameModelRetry(
      async () => {
        timeoutCalls += 1;
        throw new UpstreamError("timed out", { category: "timeout" });
      },
      { maxRetries: 2, sleep: async () => {} },
    ),
    (error: unknown) =>
      error instanceof UpstreamError && error.category === "timeout",
  );
  assert.equal(timeoutCalls, 1);
});

test("generic 503, auth, policy and billing failures never same-model retry", async () => {
  const cases = [
    { status: 503, message: "Service unavailable", category: "http" },
    { status: 500, message: 'host_call_failed: {"error":{"code":503,"status":"UNAVAILABLE","message":"Service unavailable"}}', category: "http" },
    { status: 401, message: "Authentication failed; rate limit exceeded", category: "auth" },
    { status: 400, message: "Content policy blocked request; no capacity", category: "policy" },
    { status: 429, message: "insufficient_quota: check your billing plan", category: "http" },
    { status: 500, message: "RESOURCE_EXHAUSTED", category: "http" },
  ];
  for (const { status, message, category } of cases) {
    const json = { error: { message } };
    const error = upstreamHttpError(
      { ok: false, status, json, text: JSON.stringify(json) },
      "POST /v1/chat/completions",
    );
    assert.equal(error.category, category, message);
    let calls = 0;
    await assert.rejects(withSameModelRetry(async () => {
      calls += 1;
      throw error;
    }, { sleep: async () => assert.fail("must not back off") }), error);
    assert.equal(calls, 1, message);
  }
});

test("truncated proxy capacity errors remain recognizable and concise", () => {
  const json = { error: { message: 'host_call_failed: auth_unavailable: no auth available (last upstream error: {\n "error": {\n "code": 503,\n "message": "No capacity available for model gemini-3.1-flash-image on the server",\n "status": "UNAVAILABLE",\n "details": [...]...)' } };
  const error = upstreamHttpError(
    { ok: false, status: 500, json, text: JSON.stringify(json) },
    "POST /v1/chat/completions",
  );
  assert.equal(error.category, "capacity");
  assert.equal(error.retryable, true);
  assert.ok(error.message.length < 320);
});
