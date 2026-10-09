import assert from "node:assert/strict";
import { promises as fsp } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "../dist/config.js";
import { cachedImageLoader } from "../dist/images/files.js";
import { createServer } from "../dist/mcp/server.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = PNG.toString("base64");

async function connect(env: Record<string, string>) {
  const server = createServer(loadConfig(env, []));
  const client = new Client({ name: "single-read-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function countReads(t: test.TestContext, file: string) {
  const reads: string[] = [];
  const original = fsp.readFile.bind(fsp);
  t.mock.method(fsp, "readFile", async (...args: Parameters<typeof fsp.readFile>) => {
    if (String(args[0]) === file) reads.push(String(args[0]));
    return original(...args);
  });
  return reads;
}

test("cachedImageLoader reads each file once and caches failures", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-loader-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "in.png");
  await writeFile(input, PNG);
  const reads = countReads(t, input);
  const load = cachedImageLoader([input]);
  const [a, b] = await Promise.all([load(), load()]);
  assert.equal(a, b);
  assert.equal((await load())[0].mimeType, "image/png");
  assert.equal(reads.length, 1);

  const missing = cachedImageLoader([path.join(dir, "missing.png")]);
  await assert.rejects(missing(), /not found/);
  await assert.rejects(missing(), /not found/);
});

test("edit_image reads inputs once across model fallback", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-edit-once-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "in.png");
  await writeFile(input, PNG);
  const reads = countReads(t, input);
  const models: string[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    models.push(String(form.get("model")));
    assert.equal(form.getAll("image").length, 1);
    if (form.get("model") !== "edit-c") {
      return new Response("upstream unavailable", { status: 503 });
    }
    return Response.json({ data: [{ b64_json: PNG_B64 }] });
  });
  const { client, close } = await connect({
    GEN_IMAGE_BASE_URL: "https://once.example",
    GEN_IMAGE_API_KEY: "k",
    GEN_IMAGE_MODEL: "edit-a,edit-b,edit-c",
    GEN_IMAGE_AUTO_FALLBACK: "true",
  });
  t.after(close);
  const result = await client.callTool({
    name: "edit_image",
    arguments: {
      prompt: "p",
      images: [input],
      mask: input,
      output_path: path.join(dir, "out.png"),
    },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.deepEqual(models, ["edit-a", "edit-b", "edit-c"]);
  // 图片和蒙版是同一路径，但分别各读一次；三次上游尝试不再重复读取。
  assert.equal(reads.length, 2);
});

test("generate_gemini_image reads reference images once across model fallback", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-gemini-once-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "ref.png");
  await writeFile(input, PNG);
  const reads = countReads(t, input);
  const bodies: Array<Record<string, any>> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://gem.example/v1/chat/completions");
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    if (body.model !== "gem-b") {
      return new Response("upstream unavailable", { status: 503 });
    }
    return Response.json({
      choices: [
        {
          message: {
            role: "assistant",
            content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${PNG_B64}` } }],
          },
        },
      ],
    });
  });
  const { client, close } = await connect({
    GEN_IMAGE_BASE_URL: "https://gem.example",
    GEN_IMAGE_API_KEY: "k",
    GEN_IMAGE_GEMINI_MODEL: "gem-a,gem-b",
    GEN_IMAGE_AUTO_FALLBACK: "true",
  });
  t.after(close);
  const result = await client.callTool({
    name: "generate_gemini_image",
    arguments: { prompt: "p", images: [input], output_path: path.join(dir, "out.png") },
  });
  assert.notEqual(result.isError, true, JSON.stringify(result.content));
  assert.deepEqual(bodies.map((b) => b.model), ["gem-a", "gem-b"]);
  for (const body of bodies) {
    assert.equal(
      body.messages[0].content[1].image_url.url,
      `data:image/png;base64,${PNG_B64}`,
    );
  }
  assert.equal(reads.length, 1);
});

test("generate_gemini_image rejects non-image references before any upstream call", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-gemini-nonimage-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fake = path.join(dir, "notes.png");
  await writeFile(fake, "not an image");
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response("unexpected", { status: 500 });
  });
  const { client, close } = await connect({
    GEN_IMAGE_BASE_URL: "https://gem2.example",
    GEN_IMAGE_API_KEY: "k",
    GEN_IMAGE_GEMINI_MODEL: "gem-a,gem-b",
    GEN_IMAGE_AUTO_FALLBACK: "true",
  });
  t.after(close);
  const result = await client.callTool({
    name: "generate_gemini_image",
    arguments: { prompt: "p", images: [fake], output_path: path.join(dir, "out.png") },
  });
  assert.equal(result.isError, true);
  assert.match(JSON.stringify(result.content), /not a supported image/);
  assert.equal(calls, 0);
});
