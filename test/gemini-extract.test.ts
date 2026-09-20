import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  buildGeminiBody,
  extractGeminiImages,
  extractGeminiText,
  geminiNoImageMessage,
} from "../dist/providers/gemini-chat.js";
import { ERROR_SNIPPET_LIMIT } from "../dist/shared/http.js";

const dir = path.dirname(fileURLToPath(import.meta.url));

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(dir, "fixtures", name), "utf8"));
}

test("extracts from choices[0].message.images[].image_url.url", () => {
  const images = extractGeminiImages(loadFixture("gemini-images-field.json"));
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
});

test("extracts image_url, inline_data, and b64_json from content array", () => {
  const images = extractGeminiImages(loadFixture("gemini-content-array.json"));
  assert.equal(images.length, 3);
  assert.ok(images.every((img) => img.mimeType === "image/png"));
});

test("extracts data URL from content string", () => {
  const images = extractGeminiImages(loadFixture("gemini-content-string.json"));
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
});

test("text-only response yields no images and keeps original text", () => {
  const payload = loadFixture("gemini-text-only.json");
  assert.equal(extractGeminiImages(payload).length, 0);
  assert.match(extractGeminiText(payload), /cannot generate/i);
});

test("extracts images when content is null", () => {
  const images = extractGeminiImages(
    loadFixture("gemini-images-content-null.json"),
  );
  assert.equal(images.length, 1);
  assert.equal(images[0].mimeType, "image/png");
});

test("text-only Gemini body uses a string content field", () => {
  const body = buildGeminiBody(
    { prompt: "blue square", model: "gemini-3.1-flash-image" },
    [],
  );
  assert.equal(
    (body.messages as { content: unknown }[])[0].content,
    "blue square",
  );
});

test("Gemini body with input images uses content parts", () => {
  const body = buildGeminiBody(
    { prompt: "edit this", model: "gemini-3.1-flash-image" },
    ["data:image/png;base64,aaa"],
  );
  const content = (body.messages as { content: unknown[] }[])[0].content;
  assert.equal(Array.isArray(content), true);
  assert.equal(content[0].type, "text");
  assert.equal(content[1].type, "image_url");
});

test("no-image errors truncate the raw HTTP body", () => {
  const huge = "x".repeat(ERROR_SNIPPET_LIMIT + 500);
  const msg = geminiNoImageMessage(
    { choices: [{ message: { content: null } }] },
    huge,
  );
  assert.equal(msg.length, ERROR_SNIPPET_LIMIT);
  assert.equal(msg, huge.slice(0, ERROR_SNIPPET_LIMIT));
});
