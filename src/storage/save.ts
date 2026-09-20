import { existsSync, statSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { extForMime, type DecodedImage } from "../images/decode.js";

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

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

export function resolveOutputPaths(opts: {
  outputPath: string;
  count: number;
  mimeTypes: string[];
  prompt: string;
  cwd?: string;
  now?: Date;
  exists?: (p: string) => boolean;
  isDir?: (p: string) => boolean;
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
  const asDir = isDirectoryTarget(opts.outputPath, cwd, io);
  const resolved = path.resolve(cwd, opts.outputPath);
  const count = Math.max(1, opts.count);
  const stamp = formatTimestamp(opts.now ?? new Date());
  const slug = slugify(opts.prompt);

  const paths: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const mime = opts.mimeTypes[i] ?? opts.mimeTypes[0] ?? "image/png";
    if (asDir) {
      const ext = extForMime(mime);
      const suffix = count > 1 ? `-${i + 1}` : "";
      paths.push(path.join(resolved, `${slug}-${stamp}${suffix}${ext}`));
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
): Promise<Array<{ absPath: string; mimeType: string; bytes: Buffer }>> {
  if (images.length === 0) throw new Error("No images to save");
  const dests = resolveOutputPaths({
    outputPath,
    count: images.length,
    mimeTypes: images.map((img) => img.mimeType),
    prompt,
    cwd,
  });
  const written: Array<{ absPath: string; mimeType: string; bytes: Buffer }> =
    [];
  for (let i = 0; i < images.length; i += 1) {
    const absPath = dests[i];
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    // 保留同名文件覆盖行为；多图输出通过序号区分，不额外生成随机文件名。
    await fs.writeFile(absPath, images[i].bytes);
    written.push({
      absPath,
      mimeType: images[i].mimeType,
      bytes: images[i].bytes,
    });
  }
  return written;
}
