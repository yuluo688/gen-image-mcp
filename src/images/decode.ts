// 模型接口统一返回这一结构，后续保存和协议层无需关心上游格式。
export type DecodedImage = {
  bytes: Buffer;
  mimeType: string;
};

const DATA_URL_RE = /^data:([^;,]+);base64,([\s\S]+)$/i;

export function stripDataUrlPrefix(raw: string): {
  mimeType?: string;
  b64: string;
} {
  const trimmed = raw.trim();
  const match = DATA_URL_RE.exec(trimmed);
  if (!match) return { b64: trimmed };
  return { mimeType: match[1].toLowerCase(), b64: match[2] };
}

export function detectMime(bytes: Buffer): string {
  // 根据文件头识别真实格式，避免上游 MIME 或文件扩展名标注错误。
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 6) {
    const header = bytes.toString("ascii", 0, 6);
    if (header === "GIF87a" || header === "GIF89a") return "image/gif";
  }
  return "application/octet-stream";
}

export function decodeBase64Image(raw: string): DecodedImage | undefined {
  const b64 = stripDataUrlPrefix(raw).b64.replace(/\s+/g, "");
  // Buffer 会宽松地解码普通 URL 或垃圾字符串，必须先校验，不能兜底成 PNG。
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return undefined;
  const bytes = Buffer.from(b64, "base64");
  if (bytes.toString("base64").replace(/=+$/, "") !== b64.replace(/=+$/, ""))
    return undefined;
  const mimeType = detectMime(bytes);
  if (mimeType === "application/octet-stream") return undefined;
  return { bytes, mimeType };
}

export function mimeToExt(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    case "image/png":
    default:
      return ".png";
  }
}

export function extToMime(ext: string): string | undefined {
  switch (ext.toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return undefined;
  }
}

export function extForMime(mimeType: string, preferredExt?: string): string {
  if (preferredExt && extToMime(preferredExt) === mimeType)
    return preferredExt.toLowerCase();
  return mimeToExt(mimeType);
}
