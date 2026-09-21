import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/mcp/server.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function withClient(
  t: test.TestContext,
  run: (client: Client, endpoints: string[], dir: string) => Promise<void>,
) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-validation-"));
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
  const client = new Client({ name: "validation-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const endpoints: string[] = [];
  const b64 = PNG.toString("base64");
  t.mock.method(globalThis, "fetch", async (url: string) => {
    endpoints.push(url);
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
    await run(client, endpoints, dir);
  } finally {
    await client.close();
    await server.close();
    await rm(dir, { recursive: true, force: true });
  }
}

test("tool schemas document output_format omit and size format", async (t) => {
  await withClient(t, async (client) => {
    const { tools } = await client.listTools();
    const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]));
    const generate = byName.generate_image.inputSchema.properties as Record<
      string,
      { description?: string; pattern?: string }
    >;
    assert.match(
      generate.output_format?.description ?? "",
      /omit|upstream/i,
    );
    assert.doesNotMatch(
      generate.output_format?.description ?? "",
      /default\s+png/i,
    );
    assert.match(generate.size?.description ?? "", /auto|1024x1024/i);
    const edit = byName.edit_image.inputSchema.properties as Record<
      string,
      { description?: string; pattern?: string }
    >;
    assert.match(edit.size?.description ?? "", /auto|1024x1024/i);
  });
});

async function assertInvalid(
  client: Client,
  name: string,
  args: Record<string, unknown>,
  pattern: RegExp,
) {
  const result = await client.callTool({ name, arguments: args });
  assert.equal(result.isError, true);
  const text = (result.content as Array<{ type: string; text?: string }>)
    .map((part) => part.text ?? "")
    .join("\n");
  assert.match(text, pattern);
}

test("blank prompts are rejected for all tools without upstream calls", async (t) => {
  await withClient(t, async (client, endpoints, dir) => {
    const source = path.join(dir, "source.png");
    await writeFile(source, PNG);
    await assertInvalid(
      client,
      "generate_image",
      { prompt: "   ", output_path: path.join(dir, "a.png") },
      /Invalid arguments|Prompt/i,
    );
    await assertInvalid(
      client,
      "edit_image",
      {
        prompt: "",
        output_path: path.join(dir, "b.png"),
        images: [source],
      },
      /Invalid arguments|Prompt/i,
    );
    await assertInvalid(
      client,
      "generate_gemini_image",
      { prompt: "\t\n", output_path: path.join(dir, "c.png") },
      /Invalid arguments|Prompt/i,
    );
    assert.deepEqual(endpoints, []);
  });
});

test("invalid size and blank image paths reject without upstream calls", async (t) => {
  await withClient(t, async (client, endpoints, dir) => {
    const source = path.join(dir, "source.png");
    await writeFile(source, PNG);
    await assertInvalid(
      client,
      "generate_image",
      {
        prompt: "ok",
        output_path: path.join(dir, "bad-size.png"),
        size: "1024",
      },
      /Invalid arguments|Size/i,
    );
    await assertInvalid(
      client,
      "generate_image",
      {
        prompt: "ok",
        output_path: path.join(dir, "zero.png"),
        size: "0x0",
      },
      /Invalid arguments|Size/i,
    );
    await assertInvalid(
      client,
      "edit_image",
      {
        prompt: "ok",
        output_path: path.join(dir, "blank-image.png"),
        images: ["  "],
      },
      /Invalid arguments/i,
    );
    await assertInvalid(
      client,
      "edit_image",
      {
        prompt: "ok",
        output_path: path.join(dir, "blank-mask.png"),
        images: [source],
        mask: " ",
      },
      /Invalid arguments/i,
    );
    assert.deepEqual(endpoints, []);
  });
});

test("valid prompts preserve whitespace and accepted sizes reach upstream", async (t) => {
  await withClient(t, async (client, endpoints, dir) => {
    const prompts: string[] = [];
    const sizes: Array<string | undefined> = [];
    t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
      endpoints.push(url);
      if (!url.endsWith("/chat/completions") && !(init.body instanceof FormData)) {
        const body = JSON.parse(init.body as string);
        prompts.push(body.prompt);
        sizes.push(body.size);
      }
      const b64 = PNG.toString("base64");
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

    const spaced = "  keep leading and trailing  ";
    const result = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: spaced,
        output_path: path.join(dir, "spaced.png"),
        size: "1024x1024",
      },
    });
    assert.notEqual(result.isError, true);
    assert.deepEqual(prompts, [spaced]);
    assert.deepEqual(sizes, ["1024x1024"]);

    const autoResult = await client.callTool({
      name: "generate_image",
      arguments: {
        prompt: "auto size",
        output_path: path.join(dir, "auto.png"),
        size: "auto",
      },
    });
    assert.notEqual(autoResult.isError, true);
    assert.equal(sizes.at(-1), "auto");
    assert.equal(endpoints.length, 2);
  });
});
