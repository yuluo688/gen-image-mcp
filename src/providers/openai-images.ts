import { decodeBase64Image, type DecodedImage } from "../images/decode.js";
import {
  assertImageCount,
  cachedImageLoader,
  type LocalFile,
  type LocalImageLoader,
} from "../images/files.js";
import {
  postForm,
  postJson,
  UpstreamError,
  upstreamHttpError,
  type HttpJsonResult,
} from "../shared/http.js";
import { asRecord } from "../shared/object.js";

export type ImagesClient = {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
};

// 兼容代理返回的裸 Base64 和 data URL，不在此层处理 MCP 响应或文件保存。
export function parseImagesResponse(payload: unknown): DecodedImage[] {
  const root = asRecord(payload);
  const data = root?.data;
  if (!Array.isArray(data)) return [];
  const images: DecodedImage[] = [];
  for (const item of data) {
    const rec = asRecord(item);
    if (!rec) continue;
    const raw =
      (typeof rec.b64_json === "string" && rec.b64_json) ||
      (typeof rec.url === "string" && rec.url) ||
      undefined;
    if (!raw) continue;
    const decoded = decodeBase64Image(raw);
    if (decoded) images.push(decoded);
  }
  return images;
}

// 部分上游（如官方 OpenAI gpt-image 系列）不接受 response_format；
// 首次被 400 拒绝后去掉该参数重试，并按 baseUrl+model 记住，后续请求不再携带。
const responseFormatUnsupported = new Set<string>();

function responseFormatKey(client: ImagesClient, model: string): string {
  return `${client.baseUrl}\n${model}`;
}

export function rejectsResponseFormat(result: HttpJsonResult): boolean {
  return (
    result.status === 400 && /response[_\s-]?format/i.test(result.text)
  );
}

async function withResponseFormatFallback(
  client: ImagesClient,
  model: string,
  send: (includeResponseFormat: boolean) => Promise<HttpJsonResult>,
): Promise<HttpJsonResult> {
  const key = responseFormatKey(client, model);
  if (responseFormatUnsupported.has(key)) return send(false);
  const first = await send(true);
  if (!rejectsResponseFormat(first)) return first;
  const second = await send(false);
  if (second.ok) responseFormatUnsupported.add(key);
  return second;
}

export type GenerateImagesInput = {
  prompt: string;
  model: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  n?: number;
  outputFormat?: "png" | "jpeg" | "webp";
};

export async function generateImages(
  client: ImagesClient,
  input: GenerateImagesInput,
): Promise<DecodedImage[]> {
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    model: input.model,
    n: input.n ?? 1,
    size: input.size ?? "auto",
    response_format: "b64_json",
    stream: false,
  };
  if (input.quality) body.quality = input.quality;
  if (input.outputFormat) body.output_format = input.outputFormat;

  const result = await withResponseFormatFallback(
    client,
    input.model,
    (includeResponseFormat) => {
      const payload = { ...body };
      if (!includeResponseFormat) delete payload.response_format;
      return postJson(`${client.baseUrl}/v1/images/generations`, payload, {
        apiKey: client.apiKey,
        timeoutMs: client.timeoutMs,
      });
    },
  );
  if (!result.ok)
    throw upstreamHttpError(result, "POST /v1/images/generations");
  const images = parseImagesResponse(result.json);
  if (images.length === 0) {
    throw new UpstreamError("Images API returned no image data", {
      category: "empty_response",
    });
  }
  return images;
}

export type EditImagesInput = {
  prompt: string;
  model: string;
  images: string[];
  mask?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  cwd?: string;
  /** 由调用方在一次工具调用内共享的读取器；缺省时按 images/mask/cwd 新建。 */
  loadImages?: LocalImageLoader;
  loadMask?: LocalImageLoader;
};

// Blob 按文件对象缓存，重试和模型切换时不重复复制图片字节。
const blobCache = new WeakMap<LocalFile, Blob>();

function cachedBlob(file: LocalFile): Blob {
  let blob = blobCache.get(file);
  if (blob === undefined) {
    blob = new Blob([new Uint8Array(file.bytes)], { type: file.mimeType });
    blobCache.set(file, blob);
  }
  return blob;
}

export async function editImages(
  client: ImagesClient,
  input: EditImagesInput,
): Promise<DecodedImage[]> {
  if (input.images.length === 0)
    throw new Error("edit_image requires at least one input image");
  assertImageCount(input.images.length);

  // 本地文件每次工具调用只读一次；同模型重试、模型切换和 response_format
  // 回退都复用同一批 Blob。
  const loadImages =
    input.loadImages ?? cachedImageLoader(input.images, input.cwd);
  const loadMask =
    input.loadMask ??
    (input.mask ? cachedImageLoader([input.mask], input.cwd) : undefined);
  const files: Array<{ field: "image" | "mask"; blob: Blob; name: string }> =
    [];
  for (const file of await loadImages()) {
    files.push({ field: "image", blob: cachedBlob(file), name: file.name });
  }
  for (const file of loadMask ? await loadMask() : []) {
    files.push({ field: "mask", blob: cachedBlob(file), name: file.name });
  }

  const result = await withResponseFormatFallback(
    client,
    input.model,
    (includeResponseFormat) => {
      const form = new FormData();
      form.append("prompt", input.prompt);
      form.append("model", input.model);
      if (includeResponseFormat) form.append("response_format", "b64_json");
      if (input.size) form.append("size", input.size);
      if (input.quality) form.append("quality", input.quality);
      // 上游要求重复的 image 字段，而不是将文件数组序列化为 JSON。
      for (const file of files) form.append(file.field, file.blob, file.name);
      return postForm(`${client.baseUrl}/v1/images/edits`, form, {
        apiKey: client.apiKey,
        timeoutMs: client.timeoutMs,
      });
    },
  );
  if (!result.ok)
    throw upstreamHttpError(result, "POST /v1/images/edits");
  const images = parseImagesResponse(result.json);
  if (images.length === 0) {
    throw new UpstreamError("Images edits API returned no image data", {
      category: "empty_response",
    });
  }
  return images;
}
