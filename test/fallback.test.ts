import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/mcp/server.js";

test("MCP fallback respects protocol groups, call overrides and local failures", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-fallback-"));
  const config = loadConfig(
    {
      GEN_IMAGE_BASE_URL: "https://example.test",
      GEN_IMAGE_API_KEY: "test-key",
      GEN_IMAGE_MODEL: "image-first,image-second",
      GEN_IMAGE_GEMINI_MODEL: "gemini-first,gemini-second",
      GEN_IMAGE_AUTO_FALLBACK: "true",
    },
    [],
  );
  const server = createServer(config);
  const client = new Client({ name: "fallback-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const input = path.join(dir, "input.png");
  await writeFile(input, bytes);
  const calls: string[] = [];
  let failure = "http";
  let failAll = false;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    const model =
      init.body instanceof FormData
        ? String(init.body.get("model"))
        : JSON.parse(init.body as string).model;
    calls.push(model);
    assert.equal(
      url.endsWith("/chat/completions"),
      model.startsWith("gemini-"),
    );
    if (model.endsWith("first") || failAll) {
      if (failure === "capacity" || failure === "rate_limit") {
        return Response.json(
          { error: { message: failure === "capacity" ? "No capacity available" : "Too many requests" } },
          { status: failure === "capacity" ? 503 : 429, headers: { "Retry-After": "0" } },
        );
      }
      if (failure === "network") throw new TypeError("fetch failed");
      if (failure === "timeout") {
        return new Promise((_resolve, reject) => {
          init.signal!.addEventListener(
            "abort",
            () => {
              reject(new DOMException("aborted", "AbortError"));
            },
            { once: true },
          );
        });
      }
      if (failure === "invalid-image") {
        return Response.json({
          data: [{ url: "https://example.test/image.png" }],
        });
      }
      if (failure === "empty")
        return Response.json({
          choices: [{ message: { content: "No image" } }],
        });
      return new Response("thinking is unsupported", { status: 400 });
    }
    const b64 = bytes.toString("base64");
    return Response.json(
      model.startsWith("gemini-")
        ? {
            choices: [
              {
                message: {
                  images: [
                    { image_url: { url: `data:image/png;base64,${b64}` } },
                  ],
                },
              },
            ],
          }
        : { data: [{ b64_json: b64 }] },
    );
  });
  const call = (name: string, extra = {}) =>
    client.callTool({
      name,
      arguments: {
        prompt: "test",
        output_path: path.join(dir, "result.png"),
        ...extra,
      },
    });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    for (const name of [
      "generate_image",
      "edit_image",
      "generate_gemini_image",
    ]) {
      calls.length = 0;
      const result = await call(
        name,
        name !== "generate_image" ? { images: [input] } : {},
      );
      assert.notEqual(result.isError, true);
      assert.deepEqual(
        calls,
        name === "generate_gemini_image"
          ? ["gemini-first", "gemini-second"]
          : ["image-first", "image-second"],
      );
    }

    calls.length = 0;
    assert.equal(
      (await call("generate_gemini_image", { auto_fallback: false })).isError,
      true,
    );
    assert.deepEqual(calls, ["gemini-first"]); // 不再为 thinking 错误隐式重试。

    config.autoFallback = false;
    calls.length = 0;
    assert.notEqual(
      (await call("generate_image", { auto_fallback: true })).isError,
      true,
    );
    assert.deepEqual(calls, ["image-first", "image-second"]);
    config.autoFallback = true;

    for (failure of ["capacity", "rate_limit"]) {
      for (const name of ["generate_image", "edit_image", "generate_gemini_image"]) {
        const extra = name === "generate_image" ? {} : { images: [input] };
        const prefix = name === "generate_gemini_image" ? "gemini" : "image";
        calls.length = 0;
        assert.notEqual((await call(name, extra)).isError, true);
        assert.deepEqual(calls, [
          `${prefix}-first`, `${prefix}-first`, `${prefix}-first`, `${prefix}-second`,
        ]);
        calls.length = 0;
        assert.equal((await call(name, { ...extra, auto_fallback: false })).isError, true);
        assert.deepEqual(calls, Array(3).fill(`${prefix}-first`));
      }
    }

    config.timeoutMs = 10;
    for (failure of ["network", "empty", "invalid-image", "timeout"]) {
      calls.length = 0;
      assert.notEqual((await call("generate_image")).isError, true);
      assert.deepEqual(calls, ["image-first", "image-second"]);
    }

    calls.length = 0;
    assert.notEqual(
      (await call("generate_image", { model: "image-second" })).isError,
      true,
    );
    assert.deepEqual(calls, ["image-second"]);

    calls.length = 0;
    assert.equal(
      (await call("generate_image", { model: "unknown" })).isError,
      true,
    );
    assert.equal(
      (await call("edit_image", { images: [path.join(dir, "missing.png")] }))
        .isError,
      true,
    );
    assert.equal(
      (await call("generate_image", { auto_fallback: "yes" })).isError,
      true,
    );
    assert.deepEqual(calls, []);

    calls.length = 0;
    // 输出父路径是文件时，保存必然失败；已经成功的上游请求不能因此重发。
    assert.equal(
      (
        await call("generate_image", {
          model: "image-second",
          output_path: path.join(input, "output.png"),
        })
      ).isError,
      true,
    );
    assert.deepEqual(calls, ["image-second"]);

    calls.length = 0;
    failure = "empty";
    failAll = true;
    const result = await call("generate_image");
    assert.equal(result.isError, true);
    assert.match(
      (result.content as Array<{ text: string }>)[0].text,
      /Model image-second failed/,
    );
    assert.deepEqual(calls, ["image-first", "image-second"]);

    config.geminiModels = [];
    calls.length = 0;
    assert.equal((await call("generate_gemini_image")).isError, true);
    assert.deepEqual(calls, []);
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
