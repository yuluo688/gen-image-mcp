import { decodeBase64Image, type DecodedImage } from "../images/decode.js";
import {
  cachedImageLoader,
  toDataUrl,
  type LocalFile,
  type LocalImageLoader,
} from "../images/files.js";
import {
  postJson,
  snippet,
  UpstreamError,
  upstreamHttpError,
} from "../shared/http.js";
import { asRecord } from "../shared/object.js";

export const GEMINI_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "4:5",
  "5:4",
  "9:16",
  "16:9",
  "21:9",
] as const;

export type GeminiAspectRatio = (typeof GEMINI_ASPECT_RATIOS)[number];

export type GeminiClient = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

function pickString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function decodeFromUnknown(value: unknown): DecodedImage | undefined {
  if (typeof value === "string") return decodeBase64Image(value);
  const rec = asRecord(value);
  if (!rec) return undefined;
  const url = pickString(
    rec.url,
    asRecord(rec.image_url)?.url,
    rec.b64_json,
    rec.data,
  );
  if (url) return decodeBase64Image(url);
  return undefined;
}

function extractFromImagesField(
  message: Record<string, unknown>,
): DecodedImage[] {
  if (!Array.isArray(message.images)) return [];
  const out: DecodedImage[] = [];
  for (const item of message.images) {
    const rec = asRecord(item);
    const url = pickString(
      rec && asRecord(rec.image_url)?.url,
      rec?.url,
      typeof item === "string" ? item : undefined,
    );
    const decoded = url ? decodeBase64Image(url) : decodeFromUnknown(item);
    if (decoded) out.push(decoded);
  }
  return out;
}

function extractFromContentArray(content: unknown[]): DecodedImage[] {
  const out: DecodedImage[] = [];
  for (const part of content) {
    const rec = asRecord(part);
    if (!rec) continue;
    const type = typeof rec.type === "string" ? rec.type : "";

    if (type === "image_url" || rec.image_url) {
      const decoded =
        decodeFromUnknown(rec.image_url) ?? decodeFromUnknown(rec);
      if (decoded) out.push(decoded);
      continue;
    }

    const inline =
      asRecord(rec.inline_data) ?? (type === "inline_data" ? rec : undefined);
    if (inline && (inline.data || inline.b64_json)) {
      const raw = pickString(inline.data, inline.b64_json);
      const decoded = raw ? decodeBase64Image(raw) : undefined;
      if (decoded) out.push(decoded);
      continue;
    }

    if (typeof rec.b64_json === "string") {
      const decoded = decodeBase64Image(rec.b64_json);
      if (decoded) out.push(decoded);
    }
  }
  return out;
}

function extractDataUrlsFromText(text: string): DecodedImage[] {
  const out: DecodedImage[] = [];
  // 文本中的 data URL 在空白或填充符后结束，不能把后续说明文字吞进 Base64。
  const re = /data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}/g;
  const matches = text.match(re) ?? [];
  for (const match of matches) {
    const decoded = decodeBase64Image(match);
    if (decoded) out.push(decoded);
  }
  return out;
}

export function extractGeminiText(payload: unknown): string {
  const root = asRecord(payload);
  const message = asRecord(
    asRecord(Array.isArray(root?.choices) ? root.choices[0] : undefined)
      ?.message,
  );
  if (!message) {
    if (typeof root?.error === "string") return root.error;
    const err = asRecord(root?.error);
    if (typeof err?.message === "string") return err.message;
    return "";
  }
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const part of content) {
      if (typeof part === "string") {
        parts.push(part);
        continue;
      }
      const rec = asRecord(part);
      if (typeof rec?.text === "string") parts.push(rec.text);
    }
    return parts.join("\n").trim();
  }
  return "";
}

export function extractGeminiImages(payload: unknown): DecodedImage[] {
  const root = asRecord(payload);
  const message = asRecord(
    asRecord(Array.isArray(root?.choices) ? root.choices[0] : undefined)
      ?.message,
  );
  if (!message) return [];

  // 不同代理使用不同字段；优先读取专用图片字段，避免重复收集同一图片。
  const fromImages = extractFromImagesField(message);
  if (fromImages.length > 0) return fromImages;

  const content = message.content;
  if (Array.isArray(content)) {
    const fromParts = extractFromContentArray(content);
    if (fromParts.length > 0) return fromParts;
  }
  if (typeof content === "string") {
    return extractDataUrlsFromText(content);
  }
  return [];
}

export type GenerateGeminiInput = {
  prompt: string;
  model: string;
  images?: string[];
  aspectRatio?: GeminiAspectRatio;
  cwd?: string;
  /** 由调用方在一次工具调用内共享的读取器；缺省时按 images/cwd 新建。 */
  loadImages?: LocalImageLoader;
};

// data URL 编码结果按文件对象缓存，重试和模型切换时不重复做 Base64 编码。
const dataUrlCache = new WeakMap<LocalFile, string>();

function cachedDataUrl(file: LocalFile): string {
  let url = dataUrlCache.get(file);
  if (url === undefined) {
    url = toDataUrl(file.bytes, file.mimeType);
    dataUrlCache.set(file, url);
  }
  return url;
}

export function buildGeminiBody(
  input: GenerateGeminiInput,
  imageDataUrls: string[],
): Record<string, unknown> {
  // 纯文生图保持字符串格式；有参考图时才使用多模态消息分段。
  const content =
    imageDataUrls.length === 0
      ? input.prompt
      : [
          { type: "text", text: input.prompt },
          ...imageDataUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ];
  const body: Record<string, unknown> = {
    model: input.model,
    messages: [{ role: "user", content }],
    modalities: ["image", "text"],
  };
  if (input.aspectRatio) {
    body.image_config = { aspect_ratio: input.aspectRatio };
  }
  return body;
}

export function geminiNoImageMessage(
  payload: unknown,
  rawText: string,
): string {
  const text = extractGeminiText(payload) || snippet(rawText);
  return snippet(text) || "Gemini returned no image";
}

export async function generateGeminiImage(
  client: GeminiClient,
  input: GenerateGeminiInput,
): Promise<DecodedImage[]> {
  const loadImages =
    input.loadImages ?? cachedImageLoader(input.images ?? [], input.cwd);
  const imageDataUrls = (await loadImages()).map(cachedDataUrl);

  const body = buildGeminiBody(input, imageDataUrls);
  const result = await postJson(
    `${client.baseUrl}/v1/chat/completions`,
    body,
    client,
  );
  if (!result.ok)
    throw upstreamHttpError(result, "POST /v1/chat/completions");

  const images = extractGeminiImages(result.json);
  if (images.length === 0) {
    throw new UpstreamError(geminiNoImageMessage(result.json, result.text), {
      category: "empty_response",
    });
  }
  return images;
}
