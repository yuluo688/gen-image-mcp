import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { extForMime, type DecodedImage } from "../images/decode.js";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const MAX_BASENAME_LENGTH = 200;
const MAX_COLLISION_ATTEMPTS = 1000;
const WINDOWS_RESERVED = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
const INVALID_BASENAME_CHARS = /[<>:"|?*\u0000-\u001f]/;

export function slugify(prompt: string): string {
  const slug = prompt
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/g, "");
  return slug || "image";
}

export function formatTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function hasTrailingSep(outputPath: string): boolean {
  return /[\\/]$/.test(outputPath);
}

export function isDirectoryTarget(
  outputPath: string,
  cwd = process.cwd(),
  io: { exists: (p: string) => boolean; isDir: (p: string) => boolean } = {
    exists: existsSync,
    isDir: (p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
  },
): boolean {
  // 尾部分隔符、已存在目录或非图片后缀均按目录处理，保持原有路径约定。
  if (hasTrailingSep(outputPath)) return true;
  const resolved = path.resolve(cwd, outputPath);
  if (io.exists(resolved) && io.isDir(resolved)) return true;
  const ext = path.extname(path.basename(resolved)).toLowerCase();
  return !IMAGE_EXTS.has(ext);
}

function assertSafeBasename(filename: string): void {
  if (typeof filename !== "string" || filename.trim() === "") {
    throw new Error("filename must be a non-blank basename");
  }
  if (filename !== filename.trim()) {
    throw new Error("filename must not have leading or trailing whitespace");
  }
  if (filename.includes("/") || filename.includes("\\")) {
    throw new Error("filename must be a basename without path separators");
  }
  if (filename === "." || filename === "..") {
    throw new Error("filename must not be a path traversal basename");
  }
  if (INVALID_BASENAME_CHARS.test(filename)) {
    throw new Error("filename contains invalid characters");
  }
  if (/[. ]$/.test(filename)) {
    throw new Error("filename must not end with a dot or space");
  }
  if (Buffer.byteLength(filename, "utf8") > MAX_BASENAME_LENGTH) {
    throw new Error(
      `filename must be at most ${MAX_BASENAME_LENGTH} UTF-8 bytes`,
    );
  }
  const stem = path.parse(filename).name;
  const deviceName = filename.split(".")[0].trimEnd().normalize("NFKC");
  if (!stem || WINDOWS_RESERVED.test(deviceName)) {
    throw new Error("filename uses a reserved or empty name");
  }
}

/**
 * Preflight check for optional AI/user filename. No-op when filename is omitted.
 * Throws when filename is unsafe or output_path is an explicit file target.
 * Call before any upstream generation; writeImages reuses the same rules.
 */
export function validateOutputFilename(
  outputPath: string,
  filename?: string,
  cwd = process.cwd(),
): void {
  if (filename === undefined) return;
  assertSafeBasename(filename);
  const resolved = path.resolve(cwd, outputPath);
  if (
    !isDirectoryTarget(outputPath, cwd) ||
    (existsSync(resolved) && !statSync(resolved).isDirectory())
  ) {
    throw new Error(
      "filename requires output_path to be a directory target, not an explicit file",
    );
  }
}

function collisionCandidate(filePath: string, attempt: number): string {
  if (attempt === 0) return filePath;
  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}-${attempt + 1}${parsed.ext}`);
}

async function writeExclusive(
  preferredPath: string,
  bytes: Buffer,
): Promise<string> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const absPath = collisionCandidate(preferredPath, attempt);
    try {
      await fs.writeFile(absPath, bytes, { flag: "wx" });
      return absPath;
    } catch (err) {
      lastError = err;
      if ((err as NodeJS.ErrnoException)?.code !== "EEXIST") throw err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("exhausted exclusive write attempts");
}

export function resolveOutputPaths(opts: {
  outputPath: string;
  count: number;
  mimeTypes: string[];
  prompt: string;
  cwd?: string;
  now?: Date;
  exists?: (p: string) => boolean;
  isDir?: (p: string) => boolean;
  filename?: string;
}): string[] {
  const cwd = opts.cwd ?? process.cwd();
  const io = {
    exists: opts.exists ?? existsSync,
    isDir:
      opts.isDir ??
      ((p: string) => {
        try {
          return statSync(p).isDirectory();
        } catch {
          return false;
        }
      }),
  };
  if (opts.filename !== undefined) {
    validateOutputFilename(opts.outputPath, opts.filename, cwd);
  }
  const asDir = isDirectoryTarget(opts.outputPath, cwd, io);
  const resolved = path.resolve(cwd, opts.outputPath);
  const count = Math.max(1, opts.count);
  const stamp = formatTimestamp(opts.now ?? new Date());
  const slug = slugify(opts.prompt);
  const uniqueId = asDir && opts.filename === undefined ? randomUUID() : "";
  const named =
    opts.filename !== undefined ? path.parse(opts.filename) : undefined;

  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const mime = opts.mimeTypes[i] ?? opts.mimeTypes[0] ?? "image/png";
    if (asDir) {
      if (named) {
        const preferredExt = named.ext || undefined;
        const ext = extForMime(mime, preferredExt);
        const suffix = count > 1 ? `-${i + 1}` : "";
        paths.push(path.join(resolved, `${named.name}${suffix}${ext}`));
      } else {
        const ext = extForMime(mime);
        const suffix = count > 1 ? `-${i + 1}` : "";
        paths.push(
          path.join(resolved, `${slug}-${stamp}-${uniqueId}${suffix}${ext}`),
        );
      }
    } else {
      const parsed = path.parse(resolved);
      const preferredExt = parsed.ext || undefined;
      // 实际图片格式优先；例如请求 out.png 但返回 JPEG 时保存为 out.jpg。
      const ext = extForMime(mime, preferredExt);
      const suffix = count > 1 ? `-${i + 1}` : "";
      paths.push(path.join(parsed.dir, `${parsed.name}${suffix}${ext}`));
    }
  }
  return paths;
}

export async function writeImages(
  images: DecodedImage[],
  outputPath: string,
  prompt: string,
  cwd = process.cwd(),
  filename?: string,
): Promise<Array<{ absPath: string; mimeType: string; bytes: Buffer }>> {
  if (images.length === 0) throw new Error("No images to save");
  if (filename !== undefined) {
    validateOutputFilename(outputPath, filename, cwd);
  }
  const asDir = isDirectoryTarget(outputPath, cwd);
  const dests = resolveOutputPaths({
    outputPath,
    count: images.length,
    mimeTypes: images.map((img) => img.mimeType),
    prompt,
    cwd,
    filename,
  });
  const written: Array<{ absPath: string; mimeType: string; bytes: Buffer }> =
    [];
  for (let i = 0; i < images.length; i += 1) {
    const preferred = dests[i];
    await fs.mkdir(path.dirname(preferred), { recursive: true });
    let absPath: string;
    if (filename !== undefined) {
      absPath = await writeExclusive(preferred, images[i].bytes);
    } else {
      // Directory outputs must never overwrite; explicit filenames retain overwrite behavior.
      await fs.writeFile(preferred, images[i].bytes, {
        flag: asDir ? "wx" : "w",
      });
      absPath = preferred;
    }
    written.push({
      absPath,
      mimeType: images[i].mimeType,
      bytes: images[i].bytes,
    });
  }
  return written;
}
