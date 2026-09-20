import assert from "node:assert/strict";
import test from "node:test";
import { postForm, postJson } from "../dist/shared/http.js";

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
    /Request timed out after 10ms/,
  );
  await assert.rejects(
    postForm("http://example.test", new FormData(), options),
    /Request timed out after 10ms/,
  );
});
