import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import { promises as fs } from "node:fs";
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
  validateOutputFilename,
  writeImages,
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

test("directory target uses slug-timestamp and a unique suffix", () => {
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
  assert.match(
    path.basename(dest),
    /^a-red-cube-20260920-150253-[a-f0-9-]{36}\.png$/,
  );
});

test("identical directory requests in the same second have unique paths", () => {
  const opts = {
    outputPath: "exports",
    count: 2,
    mimeTypes: ["image/png", "image/jpeg"],
    prompt: "same prompt",
    now,
    exists: () => false,
    isDir: () => false,
  };
  const first = resolveOutputPaths(opts);
  const second = resolveOutputPaths(opts);
  assert.equal(new Set([...first, ...second]).size, 4);
  assert.match(first[0], /-1\.png$/);
  assert.match(first[1], /-2\.jpg$/);
});

test("concurrent directory writes preserve every generated image", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      writeImages(
        [{ mimeType: "image/png", bytes: Buffer.from(`image-${index}`) }],
        "exports",
        "same",
        cwd,
      ),
    ),
  );
  assert.equal(new Set(results.map(([image]) => image.absPath)).size, 12);
  for (let index = 0; index < results.length; index += 1) {
    assert.equal(
      await fs.readFile(results[index][0].absPath, "utf8"),
      `image-${index}`,
    );
  }
});

test("explicit filenames retain overwrite behavior", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, "out.png"), "old");
  const [saved] = await writeImages(
    [{ mimeType: "image/png", bytes: Buffer.from("new") }],
    "out.png",
    "same",
    cwd,
  );
  assert.equal(saved.absPath, path.join(cwd, "out.png"));
  assert.equal(await fs.readFile(saved.absPath, "utf8"), "new");
});

test("directory writes use exclusive creation and propagate collisions", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const collision = Object.assign(new Error("file already exists"), {
    code: "EEXIST",
  });
  const write = t.mock.method(fs, "writeFile", async (_path, _data, options) => {
    assert.equal(options.flag, "wx");
    throw collision;
  });
  await assert.rejects(
    writeImages(
      [{ mimeType: "image/png", bytes: Buffer.from("new") }],
      "exports",
      "same",
      cwd,
    ),
    collision,
  );
  assert.equal(write.mock.callCount(), 1);
});

test("validateOutputFilename no-ops when filename omitted", () => {
  assert.doesNotThrow(() => validateOutputFilename("exports"));
  assert.doesNotThrow(() => validateOutputFilename("out.png"));
});

test("validateOutputFilename accepts Unicode basename with optional extension", () => {
  assert.doesNotThrow(() =>
    validateOutputFilename("exports", "美丽风景.png"),
  );
  assert.doesNotThrow(() => validateOutputFilename("exports", "风景"));
});

test("validateOutputFilename rejects unsafe names without stripping", () => {
  assert.throws(() => validateOutputFilename("exports", ""), /non-blank/);
  assert.throws(() => validateOutputFilename("exports", "   "), /non-blank/);
  assert.throws(
    () => validateOutputFilename("exports", "a/b.png"),
    /path separators/,
  );
  assert.throws(
    () => validateOutputFilename("exports", "a\\b.png"),
    /path separators/,
  );
  assert.throws(
    () => validateOutputFilename("exports", ".."),
    /path traversal/,
  );
  assert.throws(
    () => validateOutputFilename("exports", "foo?.png"),
    /invalid characters/,
  );
  assert.throws(
    () => validateOutputFilename("exports", "foo."),
    /dot or space/,
  );
  assert.throws(
    () => validateOutputFilename("exports", "CON.png"),
    /reserved/,
  );
  assert.throws(
    () => validateOutputFilename("exports", "nul"),
    /reserved/,
  );
  for (const filename of ["con.backup.png", "NUL .jpg", "COM\u00b9.png"]) {
    assert.throws(() => validateOutputFilename("exports", filename), /reserved/);
  }
  assert.throws(
    () => validateOutputFilename("exports", "风".repeat(100)),
    /UTF-8 bytes/,
  );
  assert.throws(
    () => validateOutputFilename("exports", `x${"a".repeat(200)}.png`),
    /at most 200/,
  );
});

test("validateOutputFilename rejects explicit file output_path", () => {
  assert.throws(
    () => validateOutputFilename("out.png", "风景.png"),
    /directory target/,
  );
});

test("named Unicode output uses actual mime extension", () => {
  const [dest] = resolveOutputPaths({
    outputPath: "exports",
    count: 1,
    mimeTypes: ["image/jpeg"],
    prompt: "ignored",
    cwd: "/tmp",
    now,
    filename: "美丽风景.png",
  });
  assert.equal(path.basename(dest), "美丽风景.jpg");
});

test("named n>1 inserts -1 -2 before the extension", () => {
  const dests = resolveOutputPaths({
    outputPath: "exports",
    count: 2,
    mimeTypes: ["image/png", "image/png"],
    prompt: "ignored",
    cwd: "/tmp",
    now,
    filename: "封面",
  });
  assert.equal(path.basename(dests[0]), "封面-1.png");
  assert.equal(path.basename(dests[1]), "封面-2.png");
});

test("named duplicate auto suffix preserves original", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.mkdir(path.join(cwd, "exports"));
  await fs.writeFile(path.join(cwd, "exports", "美丽风景.png"), "original");
  const [saved] = await writeImages(
    [{ mimeType: "image/png", bytes: Buffer.from("new") }],
    "exports",
    "prompt",
    cwd,
    "美丽风景.png",
  );
  assert.equal(path.basename(saved.absPath), "美丽风景-2.png");
  assert.equal(
    await fs.readFile(path.join(cwd, "exports", "美丽风景.png"), "utf8"),
    "original",
  );
  assert.equal(await fs.readFile(saved.absPath, "utf8"), "new");
});

test("concurrent named writes with same filename all succeed", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const results = await Promise.all(
    Array.from({ length: 8 }, (_, index) =>
      writeImages(
        [{ mimeType: "image/png", bytes: Buffer.from(`named-${index}`) }],
        "exports",
        "same",
        cwd,
        "同名.png",
      ),
    ),
  );
  const paths = results.map(([image]) => image.absPath);
  assert.equal(new Set(paths).size, 8);
  const basenames = paths.map((p) => path.basename(p)).sort();
  assert.ok(basenames.includes("同名.png"));
  for (let index = 0; index < results.length; index += 1) {
    assert.equal(
      await fs.readFile(results[index][0].absPath, "utf8"),
      `named-${index}`,
    );
  }
});

test("named n>1 writeImages produces distinct numbered files", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const written = await writeImages(
    [
      { mimeType: "image/png", bytes: Buffer.from("a") },
      { mimeType: "image/jpeg", bytes: Buffer.from("b") },
    ],
    "exports",
    "pair",
    cwd,
    "组图.webp",
  );
  assert.equal(path.basename(written[0].absPath), "组图-1.png");
  assert.equal(path.basename(written[1].absPath), "组图-2.jpg");
});

test("named write propagates non-EEXIST errors", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const boom = Object.assign(new Error("disk full"), { code: "ENOSPC" });
  t.mock.method(fs, "writeFile", async () => {
    throw boom;
  });
  await assert.rejects(
    writeImages(
      [{ mimeType: "image/png", bytes: Buffer.from("x") }],
      "exports",
      "same",
      cwd,
      "ok.png",
    ),
    boom,
  );
});

test("named write collision retries are bounded", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const collision = Object.assign(new Error("already exists"), { code: "EEXIST" });
  const write = t.mock.method(fs, "writeFile", async () => { throw collision; });
  await assert.rejects(
    writeImages(
      [{ mimeType: "image/png", bytes: Buffer.from("x") }],
      "exports",
      "same",
      cwd,
      "occupied.png",
    ),
    collision,
  );
  assert.equal(write.mock.callCount(), 1000);
});

test("named output rejects existing non-image file as a directory", async (t) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "gen-image-save-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  await fs.writeFile(path.join(cwd, "exports"), "existing file");
  assert.throws(
    () => validateOutputFilename("exports", "portrait.png", cwd),
    /directory target/,
  );
});

test("writeImages rejects invalid filename and file-target combo", async () => {
  await assert.rejects(
    writeImages(
      [{ mimeType: "image/png", bytes: Buffer.from("x") }],
      "out.png",
      "same",
      process.cwd(),
      "风景.png",
    ),
    /directory target/,
  );
  await assert.rejects(
    writeImages(
      [{ mimeType: "image/png", bytes: Buffer.from("x") }],
      "exports",
      "same",
      process.cwd(),
      "../x.png",
    ),
    /path separators/,
  );
});
