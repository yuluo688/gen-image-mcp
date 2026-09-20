import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { ImageRegistry, resourceUri } from "../dist/storage/registry.js";
import { successResult } from "../dist/mcp/result.js";

test("registry list/read uses uuid uris not file paths", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gen-image-"));
  const absPath = path.join(dir, "cube.png");
  const bytes = Buffer.from("png-bytes");
  await writeFile(absPath, bytes);
  try {
    const registry = new ImageRegistry();
    assert.equal(registry.list().length, 0);
    const item = registry.register(absPath, "image/png", "fixed-id");
    assert.equal(item.uri, "gen-image:///fixed-id");
    assert.equal(resourceUri("fixed-id"), "gen-image:///fixed-id");
    assert.equal(item.absPath.includes("cube.png"), true);
    assert.ok(!item.uri.includes(absPath.replaceAll("\\", "/")));
    const listed = registry.list();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, "cube.png");
    assert.equal(listed[0].mimeType, "image/png");
    const got = registry.get("fixed-id");
    assert.ok(got);
    const blob = (await readFile(got.absPath)).toString("base64");
    assert.equal(blob, bytes.toString("base64"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("resource_link uri matches registry uri", () => {
  const result = successResult([
    {
      absPath: "/tmp/x.png",
      uri: "gen-image:///rid",
      name: "x.png",
      mimeType: "image/png",
      bytes: Buffer.from([1, 2, 3]),
    },
  ]);
  const link = result.content.find((c) => c.type === "resource_link");
  assert.equal(link?.uri, "gen-image:///rid");
});
