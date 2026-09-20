import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseImagesResponse } from "../dist/providers/openai-images.js";
import { detectMime, stripDataUrlPrefix } from "../dist/images/decode.js";
import { successResult, PREVIEW_LIMIT_BYTES } from "../dist/mcp/result.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

test("remote URLs and non-image base64 are not accepted as PNG output", () => {
  for (const raw of [
    "https://example.test/image.png",
    "not an image!",
    Buffer.from("upstream failed").toString("base64"),
    `data:image/png;base64,${Buffer.from("not a PNG").toString("base64")}`,
  ]) {
    assert.deepEqual(parseImagesResponse({ data: [{ url: raw }] }), []);
    assert.deepEqual(parseImagesResponse({ data: [{ b64_json: raw }] }), []);
  }
});

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, "fixtures", name), "utf8"));
}

test("parseImagesResponse reads b64_json", () => {
  const images = parseImagesResponse(loadFixture("openai-b64.json"));
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
  assert.equal(detectMime(images[0].bytes), "image/png");
});

test("parseImagesResponse strips data URL prefix from url field", () => {
  const images = parseImagesResponse(loadFixture("openai-data-url.json"));
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
  const stripped = stripDataUrlPrefix(
    (loadFixture("openai-data-url.json") as { data: { url: string }[] }).data[0]
      .url,
  );
  assert.equal(stripped.mimeType, "image/png");
  assert.ok(!stripped.b64.startsWith("data:"));
});

test("successResult attaches preview image at or under 2MiB", () => {
  const bytes = Buffer.alloc(PREVIEW_LIMIT_BYTES, 1);
  const result = successResult([
    {
      absPath: "C:\\tmp\\a.png",
      uri: "gen-image:///abc",
      name: "a.png",
      mimeType: "image/png",
      bytes,
    },
  ]);
  assert.equal(result.content[0].type, "text");
  assert.equal(result.content[1].type, "image");
  assert.equal(result.content[2].type, "resource_link");
  assert.equal(result.content[2].uri, "gen-image:///abc");
});

test("successResult omits image content over 2MiB", () => {
  const bytes = Buffer.alloc(PREVIEW_LIMIT_BYTES + 1, 1);
  const result = successResult([
    {
      absPath: "C:\\tmp\\big.png",
      uri: "gen-image:///big",
      name: "big.png",
      mimeType: "image/png",
      bytes,
    },
  ]);
  assert.deepEqual(
    result.content.map((c) => c.type),
    ["text", "resource_link"],
  );
});
