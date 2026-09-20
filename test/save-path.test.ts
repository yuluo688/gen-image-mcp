import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  assertFileSize,
  assertImageCount,
  MAX_INPUT_IMAGES,
} from "../dist/images/files.js";
import {
  isDirectoryTarget,
  resolveOutputPaths,
  slugify,
} from "../dist/storage/save.js";

const now = new Date("2026-09-20T15:02:53");

test("assertFileSize rejects over the cap", () => {
  assert.doesNotThrow(() => assertFileSize(50 * 1024 * 1024));
  assert.throws(() => assertFileSize(50 * 1024 * 1024 + 1), /too large/);
});

test("assertImageCount rejects more than 16", () => {
  assert.doesNotThrow(() => assertImageCount(MAX_INPUT_IMAGES));
  assert.throws(
    () => assertImageCount(MAX_INPUT_IMAGES + 1),
    /Too many input images/,
  );
});

test("slugify falls back when prompt has no latin letters", () => {
  assert.equal(slugify("你好世界"), "image");
  assert.equal(slugify("Red Cube!!"), "red-cube");
});

test("output_path with image extension is a file", () => {
  assert.equal(
    isDirectoryTarget("out.png", "/tmp", {
      exists: () => false,
      isDir: () => false,
    }),
    false,
  );
  assert.equal(
    isDirectoryTarget("photos/cat.jpeg", "/tmp", {
      exists: () => false,
      isDir: () => false,
    }),
    false,
  );
});

test("output_path without image extension is a directory", () => {
  assert.equal(
    isDirectoryTarget("out", "/tmp", {
      exists: () => false,
      isDir: () => false,
    }),
    true,
  );
  assert.equal(
    isDirectoryTarget("out/", "/tmp", {
      exists: () => false,
      isDir: () => false,
    }),
    true,
  );
  assert.equal(
    isDirectoryTarget("out\\", "/tmp", {
      exists: () => false,
      isDir: () => false,
    }),
    true,
  );
});

test("existing directory is a directory even with a misleading name", () => {
  assert.equal(
    isDirectoryTarget("gallery.png", "/tmp", {
      exists: (p) => p === path.resolve("/tmp", "gallery.png"),
      isDir: () => true,
    }),
    true,
  );
});

test("file target overwrites and follows actual mime extension", () => {
  const [dest] = resolveOutputPaths({
    outputPath: "C:/pics/out.png",
    count: 1,
    mimeTypes: ["image/jpeg"],
    prompt: "cat",
    cwd: "C:/",
    now,
    exists: () => false,
    isDir: () => false,
  });
  assert.equal(path.basename(dest), "out.jpg");
});

test("n>1 inserts -1 -2 before the extension", () => {
  const dests = resolveOutputPaths({
    outputPath: "out.webp",
    count: 2,
    mimeTypes: ["image/webp", "image/webp"],
    prompt: "pair",
    cwd: "/tmp",
    now,
    exists: () => false,
    isDir: () => false,
  });
  assert.equal(path.basename(dests[0]), "out-1.webp");
  assert.equal(path.basename(dests[1]), "out-2.webp");
});

test("directory target uses slug-timestamp", () => {
  const [dest] = resolveOutputPaths({
    outputPath: "exports",
    count: 1,
    mimeTypes: ["image/png"],
    prompt: "A red cube",
    cwd: "/tmp",
    now,
    exists: () => false,
    isDir: () => false,
  });
  assert.equal(path.basename(dest), "a-red-cube-20260920-150253.png");
});
