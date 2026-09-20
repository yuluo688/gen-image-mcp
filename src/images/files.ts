import { promises as fs } from "node:fs";
import path from "node:path";
import { detectMime, extToMime } from "./decode.js";

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
  const detected = detectMime(bytes);
  const fromExt = extToMime(path.extname(absPath));
  const mimeType =
    detected !== "application/octet-stream"
      ? detected
      : (fromExt ?? "application/octet-stream");
  return {
    absPath,
    name: path.basename(absPath),
    bytes,
    mimeType,
  };
}

export function toDataUrl(bytes: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`;
}
