import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/mcp/server.js";
import { runWithModels } from "../dist/providers/models.js";
import { UpstreamError } from "../dist/shared/http.js";
import { successResult } from "../dist/mcp/result.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("successResult keeps legacy content shape and adds structured images", () => {
  const result = successResult([
    {
      absPath: "/tmp/x.png",
      uri: "gen-image:///rid",
      name: "x.png",
      mimeType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
    },
  ]);
  assert.deepEqual(
    result.content.map((part) => part.type),
    ["text", "image", "resource_link"],
  );
  assert.match(
    (result.content[0] as { text: string }).text,
    /saved: \/tmp\/x\.png/,
  );
  assert.equal(result.structuredContent.images[0].uri, "gen-image:///rid");
  assert.equal(result.structuredContent.images[0].byte_size, 3);
  assert.equal(result.structuredContent.model, null);
  assert.equal(result.structuredContent.attempt_count, 0);
});

test("runWithModels hooks record retries switches and skip local errors", async () => {
  const attempts: Array<{ model: string; outcome: string }> = [];
  const switches: Array<{ from: string; to: string }> = [];
  const calls: string[] = [];
  const result = await runWithModels(
    ["first", "second"],
    undefined,
    true,
    async (model) => {
      calls.push(model);
      if (model === "first") {
        throw new UpstreamError("No capacity available", {
          category: "capacity",
          status: 503,
        });
      }
      return "ok";
    },
    {
      maxRetries: 2,
      sleep: async () => {},
      onAttempt: (info) => {
        attempts.push({ model: info.model, outcome: info.outcome });
      },
      onModelSwitch: (info) => {
        switches.push(info);
      },
    },
  );
  assert.equal(result, "ok");
  assert.deepEqual(calls, ["first", "first", "first", "second"]);
  assert.deepEqual(attempts, [
    { model: "first", outcome: "error" },
    { model: "first", outcome: "error" },
    { model: "first", outcome: "error" },
    { model: "second", outcome: "success" },
  ]);
  assert.deepEqual(switches, [{ from: "first", to: "second" }]);

  let localAttempts = 0;
  await assert.rejects(
    runWithModels(
      ["only"],
      undefined,
      true,
      async () => {
        throw new Error("Input file not found");
      },
      {
        onAttempt: () => {
          localAttempts += 1;
        },
      },
    ),
    /Input file not found/,
  );
  assert.equal(localAttempts, 0);
});

test("generation structuredContent tracks actual model after fallback and local preflight", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-telemetry-"));
  const config = loadConfig(
    {
      GEN_IMAGE_BASE_URL: "https://example.test",
      GEN_IMAGE_API_KEY: "test-key",
      GEN_IMAGE_MODEL: "image-first,image-second",
      GEN_IMAGE_GEMINI_MODEL: "gemini-first",
      GEN_IMAGE_AUTO_FALLBACK: "true",
    },
    [],
  );
  const server = createServer(config);
  const client = new Client({ name: "telemetry-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const b64 = PNG.toString("base64");
  let failFirst = true;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    if (failFirst && body.model === "image-first") {
      return Response.json(
        { error: { message: "No capacity available" } },
        { status: 503, headers: { "Retry-After": "0" } },
      );
    }
    return Response.json({ data: [{ b64_json: b64 }] });
  });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const ok = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "telemetry",
        output_path: path.join(dir, "out.png"),
      },
    });
    assert.notEqual(ok.isError, true);
    const content = ok.content as Array<{ type: string }>;
    assert.deepEqual(
      content.map((part) => part.type),
      ["text", "image", "resource_link"],
    );
    const sc = ok.structuredContent as {
      model: string;
      attempt_count: number;
      retry_count: number;
      model_switches: Array<{ from: string; to: string }>;
      attempts: Array<{ model: string; outcome: string }>;
      images: Array<{ path: string; name: string; mime_type: string; byte_size: number; uri: string }>;
      elapsed_ms: number;
    };
    assert.equal(sc.model, "image-second");
    assert.equal(sc.attempt_count, 4);
    assert.equal(sc.retry_count, 2);
    assert.deepEqual(sc.model_switches, [
      { from: "image-first", to: "image-second" },
    ]);
    assert.equal(sc.attempts.at(-1)?.outcome, "success");
    assert.equal(sc.images.length, 1);
    assert.ok(sc.elapsed_ms >= 0);
    assert.ok(sc.images[0].uri.startsWith("gen-image:///"));
    assert.equal(sc.images[0].mime_type, "image/png");
    assert.equal(sc.images[0].byte_size, PNG.length);

    const exhausted = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "failure telemetry",
        output_path: path.join(dir, "failed.png"),
        auto_fallback: false,
      },
    });
    assert.equal(exhausted.isError, true);
    const failed = exhausted.structuredContent as {
      model: string;
      attempt_count: number;
      retry_count: number;
      images: unknown[];
      error: { category: string; http_status: number };
    };
    assert.equal(failed.model, "image-first");
    assert.equal(failed.attempt_count, 3);
    assert.equal(failed.retry_count, 2);
    assert.deepEqual(failed.images, []);
    assert.equal(failed.error.category, "capacity");
    assert.equal(failed.error.http_status, 503);

    failFirst = false;
    const local = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "bad model",
        output_path: path.join(dir, "local.png"),
        model: "not-configured",
      },
    });
    assert.equal(local.isError, true);
    const localSc = local.structuredContent as {
      model: null;
      attempt_count: number;
      images: unknown[];
      error: { message: string };
    };
    assert.equal(localSc.model, null);
    assert.equal(localSc.attempt_count, 0);
    assert.deepEqual(localSc.images, []);
    assert.match(localSc.error.message, /not configured/);

    const missing = await client.callTool({
      name: "edit_image",
      arguments: {
        prompt: "edit",
        output_path: path.join(dir, "edit.png"),
        images: [path.join(dir, "missing-input.png")],
      },
    });
    assert.equal(missing.isError, true);
    const missingSc = missing.structuredContent as {
      attempt_count: number;
      model: string | null;
    };
    assert.equal(missingSc.attempt_count, 0);
    assert.equal(missingSc.model, null);
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("filename validation rejects before fetch and accepts directory target", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-filename-"));
  const config = loadConfig(
    {
      GEN_IMAGE_BASE_URL: "https://example.test",
      GEN_IMAGE_API_KEY: "test-key",
      GEN_IMAGE_MODEL: "image-first",
      GEN_IMAGE_GEMINI_MODEL: "gemini-first",
    },
    [],
  );
  const server = createServer(config);
  const client = new Client({ name: "filename-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const endpoints: string[] = [];
  const b64 = PNG.toString("base64");
  t.mock.method(globalThis, "fetch", async (url: string) => {
    endpoints.push(url);
    return Response.json({ data: [{ b64_json: b64 }] });
  });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);

    const bad = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "named",
        output_path: path.join(dir, "explicit.png"),
        filename: "hero.png",
      },
    });
    assert.equal(bad.isError, true);
    assert.deepEqual(endpoints, []);
    assert.match(
      ((bad.content as Array<{ text: string }>)[0].text),
      /directory|filename/i,
    );

    const unsafe = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "named",
        output_path: dir,
        filename: "../escape.png",
      },
    });
    assert.equal(unsafe.isError, true);
    assert.deepEqual(endpoints, []);

    const ok = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "named",
        output_path: dir,
        filename: "海报.png",
      },
    });
    assert.notEqual(ok.isError, true);
    assert.equal(endpoints.length, 1);
    const sc = ok.structuredContent as {
      images: Array<{ path: string; name: string }>;
      model: string;
      attempt_count: number;
    };
    assert.equal(sc.model, "image-first");
    assert.equal(sc.attempt_count, 1);
    assert.equal(sc.images[0].name, "海报.png");
    assert.ok(sc.images[0].path.endsWith(`${path.sep}海报.png`));
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});
