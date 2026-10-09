import { asRecord } from "./object.js";

// 保留原始响应文本，便于上游返回非 JSON 错误页面时仍能定位问题。
export type HttpJsonResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
  retryAfterMs?: number;
};

export type UpstreamErrorCategory =
  | "capacity"
  | "rate_limit"
  | "auth"
  | "policy"
  | "timeout"
  | "network"
  | "http"
  | "empty_response"
  | "unknown";

export type UpstreamErrorOptions = {
  status?: number;
  category?: UpstreamErrorCategory;
  retryAfterMs?: number;
  cause?: unknown;
};

// 只有上游失败允许切换模型，本地参数、读写文件等错误应直接返回。
export class UpstreamError extends Error {
  readonly status?: number;
  readonly category: UpstreamErrorCategory;
  readonly retryAfterMs?: number;

  constructor(message: string, options: UpstreamErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "UpstreamError";
    this.status = options.status;
    this.category = options.category ?? "unknown";
    this.retryAfterMs = options.retryAfterMs;
  }

  get retryable(): boolean {
    return this.category === "capacity" || this.category === "rate_limit";
  }
}

const CAPACITY_RE =
  /no capacity|capacity[-_\s]?(?:exhausted|unavailable)|MODEL_CAPACITY_EXHAUSTED/i;
const RATE_LIMIT_RE =
  /rate[-_\s]?limit|too many requests|throttl/i;
const POLICY_RE =
  /content[-_\s]?policy|safety|moderation|blocked|responsible[-_\s]?ai|nsfw/i;
const AUTH_RE = /invalid[-_\s]?api[-_\s]?key|unauthorized|authentication|forbidden/i;

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(trimmed);
  if (Number.isNaN(dateMs)) return undefined;
  const delta = dateMs - Date.now();
  return delta > 0 ? delta : 0;
}

function collectText(...values: unknown[]): string {
  const parts: string[] = [];
  for (const value of values) {
    if (typeof value === "string" && value.trim()) parts.push(value);
  }
  return parts.join("\n");
}

function nestedPayloadFromMessage(message: string): unknown {
  const start = message.indexOf("{");
  if (start === -1) return undefined;
  const slice = message.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    // 代理常把内层 JSON 嵌进转义字符串；尝试从 host_call_failed 载荷中再解一层。
    const unescaped = slice
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    try {
      return JSON.parse(unescaped);
    } catch {
      return undefined;
    }
  }
}

type ParsedUpstream = {
  message: string;
  code?: number;
  statusText?: string;
  innerStatus?: number;
};

function readErrorNode(node: unknown): ParsedUpstream | undefined {
  const root = asRecord(node);
  if (!root) return undefined;
  const err = asRecord(root.error) ?? (typeof root.message === "string" ? root : undefined);
  if (!err) return undefined;

  const message = collectText(err.message, root.message);
  const code =
    typeof err.code === "number"
      ? err.code
      : typeof root.code === "number"
        ? root.code
        : undefined;
  const statusText =
    typeof err.status === "string"
      ? err.status
      : typeof root.status === "string"
        ? root.status
        : undefined;

  let innerStatus: number | undefined;
  let innerMessage = message;
  if (message) {
    const nested = nestedPayloadFromMessage(message);
    const nestedParsed = readErrorNode(nested);
    if (nestedParsed) {
      innerMessage = nestedParsed.message || message;
      innerStatus =
        nestedParsed.code ??
        nestedParsed.innerStatus ??
        (nestedParsed.statusText === "UNAVAILABLE" ? 503 : undefined);
    } else if (typeof code === "number" && code >= 100) {
      innerStatus = code;
    }
  }

  return {
    message: innerMessage || message,
    code,
    statusText,
    innerStatus,
  };
}

export type ClassifiedHttpError = {
  category: UpstreamErrorCategory;
  detail: string;
  innerStatus?: number;
};

export function classifyHttpResult(result: HttpJsonResult): ClassifiedHttpError {
  const parsed =
    readErrorNode(result.json) ??
    (result.text ? readErrorNode(nestedPayloadFromMessage(result.text)) : undefined);
  const detail =
    (parsed?.message || result.text).trim() || "empty body";
  const haystack = `${detail}\n${result.text}`;
  const innerStatus = parsed?.innerStatus;

  if (
    result.status === 401 || innerStatus === 401 ||
    result.status === 403 || innerStatus === 403 || AUTH_RE.test(detail)
  ) {
    return { category: "auth", detail, innerStatus };
  }

  if (POLICY_RE.test(detail)) {
    return { category: "policy", detail, innerStatus };
  }

  if (/insufficient_quota|billing|quota[-_\s]?(?:exceeded|exhausted)/i.test(haystack)) {
    return { category: "http", detail, innerStatus };
  }

  if (
    result.status === 429 ||
    innerStatus === 429 ||
    RATE_LIMIT_RE.test(haystack)
  ) {
    return { category: "rate_limit", detail, innerStatus };
  }

  if (
    (result.status >= 500 || (innerStatus !== undefined && innerStatus >= 500)) &&
    CAPACITY_RE.test(haystack)
  ) {
    return { category: "capacity", detail, innerStatus };
  }

  return { category: "http", detail, innerStatus };
}

export function formatUpstreamHttpMessage(
  endpoint: string,
  result: HttpJsonResult,
  classified: ClassifiedHttpError,
): string {
  const shortDetail = snippet(classified.detail, 240);
  const inner =
    classified.innerStatus !== undefined && classified.innerStatus !== result.status
      ? `, upstream ${classified.innerStatus}`
      : "";
  return `${endpoint} failed (${result.status}, ${classified.category}${inner}): ${shortDetail}`;
}

export function upstreamHttpError(
  result: HttpJsonResult,
  endpoint: string,
): UpstreamError {
  const classified = classifyHttpResult(result);
  return new UpstreamError(formatUpstreamHttpMessage(endpoint, result, classified), {
    status: result.status,
    category: classified.category,
    retryAfterMs: result.retryAfterMs,
  });
}

export function formatHttpError(
  result: HttpJsonResult,
  endpoint: string,
): string {
  return formatUpstreamHttpMessage(endpoint, result, classifyHttpResult(result));
}

export const DEFAULT_SAME_MODEL_RETRIES = 2;
export const DEFAULT_RETRY_BASE_DELAY_MS = 400;
export const DEFAULT_RETRY_MAX_DELAY_MS = 5000;

export type SameModelRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: {
    attempt: number;
    maxRetries: number;
    delayMs: number;
    error: UpstreamError;
  }) => void;
};

export function retryDelayMs(
  attempt: number,
  error: UpstreamError,
  opts: { baseDelayMs?: number; maxDelayMs?: number } = {},
): number {
  const base = opts.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const max = opts.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS;
  const exponential = Math.min(max, base * 2 ** attempt);
  const hinted = error.retryAfterMs;
  if (hinted === undefined) return exponential;
  return Math.min(max, Math.max(0, hinted));
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 仅对明确的容量不足 / 限流做同模型有限退避；超时、网络、鉴权、策略错误不重试。
export async function withSameModelRetry<T>(
  run: () => Promise<T>,
  opts: SameModelRetryOptions = {},
): Promise<T> {
  const maxRetries = opts.maxRetries ?? DEFAULT_SAME_MODEL_RETRIES;
  const sleep = opts.sleep ?? defaultSleep;
  let attempt = 0;
  for (;;) {
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof UpstreamError) || !error.retryable || attempt >= maxRetries) {
        throw error;
      }
      const delayMs = retryDelayMs(attempt, error, opts);
      opts.onRetry?.({ attempt, maxRetries, delayMs, error });
      await sleep(delayMs);
      attempt += 1;
    }
  }
}

// 上游错误正文可能回显请求里的 Key；进入日志或返回给客户端前统一打码。
export function redactSecret(text: string, secret: string): string {
  if (!secret || secret.length < 4) return text;
  return text.split(secret).join("[REDACTED]");
}

// undici 的 fetch 只抛出 "fetch failed"，真正原因（ECONNREFUSED、证书错误等）在 cause 里。
export function networkErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? err.cause : undefined;
  if (!(cause instanceof Error)) return message;
  const code = (cause as NodeJS.ErrnoException).code;
  const detail = [code, cause.message].filter(Boolean).join(" ");
  if (!detail || message.includes(detail)) return message;
  return `${message}: ${detail}`;
}

// JSON 与 multipart 共用超时及响应解析，避免两条请求链路的行为逐渐分叉。
async function post(
  url: string,
  body: BodyInit,
  opts: { apiKey: string; timeoutMs: number; headers?: Record<string, string> },
): Promise<HttpJsonResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        ...opts.headers,
      },
      body,
      signal: controller.signal,
    });
    const raw = await res.text();
    // 只对失败响应打码：成功响应体是图片数据，无需也不应改写。
    const text = res.ok ? raw : redactSecret(raw, opts.apiKey);
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
    return {
      ok: res.ok,
      status: res.status,
      json,
      text,
      ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UpstreamError(
        `Request timed out after ${opts.timeoutMs}ms: ${url}`,
        { category: "timeout", cause: err },
      );
    }
    throw new UpstreamError(networkErrorMessage(err), {
      category: "network",
      cause: err,
    });
  } finally {
    clearTimeout(timer);
  }
}

export function postJson(
  url: string,
  body: unknown,
  opts: { apiKey: string; timeoutMs: number; headers?: Record<string, string> },
): Promise<HttpJsonResult> {
  return post(url, JSON.stringify(body), {
    ...opts,
    headers: { "Content-Type": "application/json", ...opts.headers },
  });
}

export function postForm(
  url: string,
  form: FormData,
  opts: { apiKey: string; timeoutMs: number },
): Promise<HttpJsonResult> {
  // 由 fetch 自动生成 multipart boundary，不能手动指定 Content-Type。
  return post(url, form, opts);
}

export const ERROR_SNIPPET_LIMIT = 2000;

export function snippet(text: string, limit = ERROR_SNIPPET_LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return trimmed.slice(0, limit);
}
