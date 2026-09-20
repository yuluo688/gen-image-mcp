import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { loadConfig } from "../dist/config.js";
import { createServer } from "../dist/mcp/server.js";
import { listConfiguredModels } from "../dist/providers/models.js";

test("listConfiguredModels returns ordered groups without probing availability", () => {
  const full = listConfiguredModels({
    models: ["image-a", "image-b"],
    geminiModels: ["gemini-a"],
    autoFallback: true,
  });
  assert.equal(full.availability_checked, false);
  assert.equal(full.auto_fallback, true);
  assert.deepEqual(full.groups, [
    {
      api: "images",
      models: ["image-a", "image-b"],
      default_model: "image-a",
      tools: ["generate_image", "edit_image"],
    },
    {
      api: "gemini",
      models: ["gemini-a"],
      default_model: "gemini-a",
      tools: ["generate_gemini_image"],
    },
  ]);

  const emptyImages = listConfiguredModels({
    models: [],
    geminiModels: ["only-gemini"],
    autoFallback: false,
  });
  assert.deepEqual(emptyImages.groups[0], {
    api: "images",
    models: [],
    default_model: null,
    tools: ["generate_image", "edit_image"],
  });
  assert.equal(emptyImages.groups[1].default_model, "only-gemini");
});

test("list_models MCP tool uses read-only annotations and never fetches", async (t) => {
  const config = loadConfig(
    {
      GEN_IMAGE_BASE_URL: "https://example.test",
      GEN_IMAGE_API_KEY: "secret-key-should-not-leak",
      GEN_IMAGE_MODEL: "image-first,image-second",
      GEN_IMAGE_GEMINI_MODEL: "gemini-first",
      GEN_IMAGE_AUTO_FALLBACK: "true",
    },
    [],
  );
  const server = createServer(config);
  const client = new Client({ name: "list-models-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  let fetchCalls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    fetchCalls += 1;
    throw new Error("list_models must not fetch");
  });
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    const { tools } = await client.listTools();
    const listed = tools.find((tool) => tool.name === "list_models");
    assert.ok(listed);
    assert.equal(listed.annotations?.readOnlyHint, true);
    assert.equal(listed.annotations?.destructiveHint, false);
    assert.equal(listed.annotations?.openWorldHint, false);

    const result = await client.callTool({ name: "list_models", arguments: {} });
    assert.notEqual(result.isError, true);
    assert.equal(fetchCalls, 0);
    const structured = result.structuredContent as {
      groups: Array<{ api: string; models: string[]; default_model: string | null }>;
      auto_fallback: boolean;
      availability_checked: boolean;
    };
    assert.equal(structured.availability_checked, false);
    assert.equal(structured.auto_fallback, true);
    assert.deepEqual(
      structured.groups.map((g) => g.models),
      [["image-first", "image-second"], ["gemini-first"]],
    );
    const text = JSON.stringify(result);
    assert.doesNotMatch(text, /secret-key/);
    assert.doesNotMatch(text, /example\.test/);
  } finally {
    await client.close();
    await server.close();
  }
});
