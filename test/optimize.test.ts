import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { loadConfig } from "../dist/config.js";
import { readLocalImage } from "../dist/images/files.js";
import { createServer } from "../dist/mcp/server.js";
import {
  editImages,
  generateImages,
  rejectsResponseFormat,
} from "../dist/providers/openai-images.js";
import {
  networkErrorMessage,
  postJson,
  redactSecret,
} from "../dist/shared/http.js";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_B64 = PNG.toString("base64");
const env = {
  GEN_IMAGE_API_KEY: "test-key",
  GEN_IMAGE_MODEL: "m",
};

test("base URL tolerates a trailing /v1", () => {
  for (const [input, expected] of [
    ["https://gw.example/v1", "https://gw.example"],
    ["https://gw.example/v1/", "https://gw.example"],
    ["https://gw.example/V1//", "https://gw.example"],
    ["https://gw.example/api/v1", "https://gw.example/api"],
    ["https://gw.example/v1beta", "https://gw.example/v1beta"],
    ["https://gw.example/", "https://gw.example"],
  ]) {
    assert.equal(
      loadConfig({ ...env, GEN_IMAGE_BASE_URL: input }, []).baseUrl,
      expected,
      input,
    );
  }
});

test("generate_image retries without response_format when upstream rejects it, then remembers", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "https://rf.example/v1/images/generations");
    const body = JSON.parse(init.body as string);
    bodies.push(body);
    if ("response_format" in body) {
      return Response.json(
        {
          error: {
            message: "Unknown parameter: 'response_format'.",
            type: "invalid_request_error",
            param: "response_format",
          },
        },
        { status: 400 },
      );
    }
    return Response.json({ data: [{ b64_json: PNG_B64 }] });
  });
  const client = { baseUrl: "https://rf.example", apiKey: "k", timeoutMs: 1000 };
  const first = await generateImages(client, { prompt: "p", model: "gpt-image-x" });
  assert.equal(first.length, 1);
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0].response_format, "b64_json");
  assert.equal("response_format" in bodies[1], false);

  await generateImages(client, { prompt: "p", model: "gpt-image-x" });
  assert.equal(bodies.length, 3, "second call skips the rejected parameter");
  assert.equal("response_format" in bodies[2], false);

  // 其他模型不受影响，仍携带 response_format。
  await generateImages(client, { prompt: "p", model: "other-model" });
  assert.equal(bodies[3].response_format, "b64_json");
});

test("response_format is kept for upstreams that accept it and other 400s are not retried", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    calls += 1;
    const body = JSON.parse(init.body as string);
    assert.equal(body.response_format, "b64_json");
    return Response.json({ error: { message: "Invalid size" } }, { status: 400 });
  });
  const client = { baseUrl: "https://rf2.example", apiKey: "k", timeoutMs: 1000 };
  await assert.rejects(
    generateImages(client, { prompt: "p", model: "keep" }),
    /Invalid size/,
  );
  assert.equal(calls, 1);
  assert.equal(
    rejectsResponseFormat({ ok: false, status: 400, json: undefined, text: "response_format not supported" }),
    true,
  );
  assert.equal(
    rejectsResponseFormat({ ok: false, status: 500, json: undefined, text: "response_format" }),
    false,
  );
});

test("edit_image retries without response_format and reads input files once", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-rf-edit-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const input = path.join(dir, "in.png");
  await writeFile(input, PNG);
  const forms: FormData[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const form = init.body as FormData;
    forms.push(form);
    if (form.has("response_format")) {
      return Response.json(
        { error: { message: "response_format is not supported for this model" } },
        { status: 400 },
      );
    }
    return Response.json({ data: [{ b64_json: PNG_B64 }] });
  });
  const images = await editImages(
    { baseUrl: "https://rf3.example", apiKey: "k", timeoutMs: 1000 },
    { prompt: "p", model: "edit-model", images: [input], mask: input },
  );
  assert.equal(images.length, 1);
  assert.equal(forms.length, 2);
  assert.equal(forms[1].has("response_format"), false);
  assert.equal(forms[1].getAll("image").length, 1);
  assert.equal(forms[1].getAll("mask").length, 1);
});

test("non-image input files are rejected before upload", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-nonimage-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const fake = path.join(dir, "secret.png");
  await writeFile(fake, "PRIVATE KEY material");
  await assert.rejects(readLocalImage(fake), /not a supported image/);
  const real = path.join(dir, "real.bin");
  await writeFile(real, PNG);
  assert.equal((await readLocalImage(real)).mimeType, "image/png");
});

test("API keys echoed by the upstream are redacted from errors", async (t) => {
  const key = "sk-super-secret-123";
  t.mock.method(globalThis, "fetch", async () =>
    Response.json(
      { error: { message: `Incorrect API key provided: ${key}` } },
      { status: 401 },
    ),
  );
  const result = await postJson("https://x.example/v1/x", {}, { apiKey: key, timeoutMs: 1000 });
  assert.equal(result.text.includes(key), false);
  assert.match(result.text, /\[REDACTED\]/);
  assert.equal(redactSecret("a key b key", "key"), "a key b key", "short secrets untouched");
  assert.equal(redactSecret("x abcd y abcd", "abcd"), "x [REDACTED] y [REDACTED]");
});

test("network errors surface the underlying cause", () => {
  const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:1"), {
    code: "ECONNREFUSED",
  });
  const err = new TypeError("fetch failed", { cause });
  assert.equal(
    networkErrorMessage(err),
    "fetch failed: ECONNREFUSED connect ECONNREFUSED 127.0.0.1:1",
  );
  assert.equal(networkErrorMessage(new Error("plain")), "plain");
});

test("MCP server reports the package.json version", async () => {
  const pkg = createRequire(import.meta.url)("../package.json") as { version: string };
  const server = createServer(
    loadConfig({ ...env, GEN_IMAGE_BASE_URL: "https://v.example" }, []),
  );
  const client = new Client({ name: "version-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  assert.equal(client.getServerVersion()?.version, pkg.version);
  await client.close();
  await server.close();
});
