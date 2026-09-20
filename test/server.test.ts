import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/mcp/server.js";

test("stdio startup rejects missing configuration without polluting stdout", () => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith("GEN_IMAGE_"),
    ),
  );
  const result = spawnSync(process.execPath, [path.resolve("dist/index.js")], {
    env,
    encoding: "utf8",
    timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /GEN_IMAGE_BASE_URL.*required/);
});

test("MCP tools save images, expose resources and keep sessions isolated", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-server-"));
  const config = loadConfig(
    {
      GEN_IMAGE_BASE_URL: "https://example.test",
      GEN_IMAGE_API_KEY: "test-key",
      GEN_IMAGE_MODEL: "image-first,image-second",
      GEN_IMAGE_GEMINI_MODEL: "gemini-first,gemini-second",
    },
    [],
  );
  const server = createServer(config);
  const client = new Client({ name: "test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  // 使用固定上游响应验证完整协议链路，不调用真实模型或消耗 API 额度。
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const b64 = bytes.toString("base64");
  const endpoints: string[] = [];
  let fail = false;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    endpoints.push(url);
    if (fail) return new Response("upstream unavailable", { status: 503 });
    if (url.endsWith("/edits")) {
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.getAll("image").length, 1);
      assert.equal(
        (init.headers as Record<string, string>)["Content-Type"],
        undefined,
      );
    } else {
      const body = JSON.parse(init.body as string);
      assert.equal(
        body.model,
        url.endsWith("/chat/completions")
          ? config.geminiModels[0]
          : config.models[0],
      );
    }
    return Response.json(
      url.endsWith("/chat/completions")
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
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name).sort(), [
      "edit_image",
      "generate_gemini_image",
      "generate_image",
    ]);
    assert.deepEqual((await client.listResources()).resources, []);

    for (const name of [
      "generate_image",
      "edit_image",
      "generate_gemini_image",
    ]) {
      const outputPath = path.join(dir, `${name}.png`);
      const result = await client.callTool({
        name,
        arguments: {
          prompt: "test image",
          output_path: outputPath,
          ...(name === "edit_image"
            ? { images: [path.join(dir, "generate_image.png")] }
            : {}),
        },
      });
      assert.notEqual(result.isError, true);
      const content = result.content as Array<{ type: string; uri?: string }>;
      assert.deepEqual(
        content.map((part) => part.type),
        ["text", "image", "resource_link"],
      );
      assert.deepEqual(await readFile(outputPath), bytes);
      const resource = await client.readResource({ uri: content[2].uri! });
      assert.equal(resource.contents[0].blob, b64);
    }
    assert.deepEqual(endpoints, [
      `${config.baseUrl}/v1/images/generations`,
      `${config.baseUrl}/v1/images/edits`,
      `${config.baseUrl}/v1/chat/completions`,
    ]);
    assert.equal((await client.listResources()).resources.length, 3);
    await assert.rejects(
      client.readResource({ uri: "gen-image:///unknown" }),
      /Unknown gen-image resource/,
    );

    fail = true;
    const result = await client.callTool({
      name: "generate_image",
      arguments: { prompt: "test", output_path: path.join(dir, "failed.png") },
    });
    assert.equal(result.isError, true);
    assert.equal((await client.listResources()).resources.length, 3);

    // 新服务实例不能访问另一个实例登记过的图片。
    const otherServer = createServer(config);
    const otherClient = new Client({ name: "other", version: "1.0.0" });
    const [otherClientTransport, otherServerTransport] =
      InMemoryTransport.createLinkedPair();
    try {
      await otherServer.connect(otherServerTransport);
      await otherClient.connect(otherClientTransport);
      assert.deepEqual((await otherClient.listResources()).resources, []);
    } finally {
      await otherClient.close();
      await otherServer.close();
    }
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("existing stdio entry point still completes an MCP handshake", async () => {
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve("dist/index.js"),
      "--base-url=https://example.test",
      "--api-key=test-key",
      "--model=test-model",
    ],
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 3);
    assert.deepEqual((await client.listResources()).resources, []);
  } finally {
    await client.close();
  }
});
