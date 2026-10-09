import { promises as fs } from "node:fs";
import path from "node:path";
import { detectMime } from "./decode.js";

// 读入内存前限制单文件大小；多图请求还需要单独限制图片数量。
export const MAX_LOCAL_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_INPUT_IMAGES = 16;

export type LocalFile = {
  absPath: string;
  name: string;
  bytes: Buffer;
  mimeType: string;
};

export function assertFileSize(
  size: number,
  maxBytes = MAX_LOCAL_FILE_BYTES,
): void {
  if (size > maxBytes) {
    throw new Error(`Input file too large (${size} bytes, max ${maxBytes})`);
  }
}

export function assertImageCount(count: number, max = MAX_INPUT_IMAGES): void {
  if (count > max) {
    throw new Error(`Too many input images (${count}, max ${max})`);
  }
}

export async function readLocalImage(
  inputPath: string,
  cwd = process.cwd(),
): Promise<LocalFile> {
  // 相对路径始终以服务进程的工作目录为基准，而不是源码目录。
  const absPath = path.resolve(cwd, inputPath);
  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    throw new Error(`Input file not found: ${absPath}`);
  }
  if (!stat.isFile()) {
    throw new Error(`Input path is not a file: ${absPath}`);
  }
  assertFileSize(stat.size);
  const bytes = await fs.readFile(absPath);
  // 只按文件头识别图片；非图片文件（含改了扩展名的）在发往上游前直接拒绝，
  // 避免把任意本地文件上传给图像服务。
  const mimeType = detectMime(bytes);
  if (mimeType === "application/octet-stream") {
    throw new Error(
      `Input file is not a supported image (PNG, JPEG, WebP or GIF): ${absPath}`,
    );
  }
  return {
    absPath,
    name: path.basename(absPath),
    bytes,
    mimeType,
  };
}

export type LocalImageLoader = () => Promise<LocalFile[]>;

// 一次工具调用内只读一次本地图片：同模型重试、模型切换和 response_format
// 回退都复用同一批内容。读取失败的 Promise 也会被缓存，不会反复读盘。
export function cachedImageLoader(
  paths: readonly string[],
  cwd?: string,
): LocalImageLoader {
  let pending: Promise<LocalFile[]> | undefined;
  return () => {
    pending ??= (async () => {
      assertImageCount(paths.length);
      const files: LocalFile[] = [];
      for (const inputPath of paths) {
        files.push(await readLocalImage(inputPath, cwd));
      }
      return files;
    })();
    return pending;
  };
}

export function toDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
