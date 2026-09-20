// 保留原始响应文本，便于上游返回非 JSON 错误页面时仍能定位问题。
export type HttpJsonResult = {
  ok: boolean;
  status: number;
  json: unknown;
  text: string;
};

// 只有上游失败允许切换模型，本地参数、读写文件等错误应直接返回。
export class UpstreamError extends Error {}

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
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    return { ok: res.ok, status: res.status, json, text };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new UpstreamError(
        `Request timed out after ${opts.timeoutMs}ms: ${url}`,
      );
    }
    throw new UpstreamError(err instanceof Error ? err.message : String(err));
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

export function formatHttpError(
  result: HttpJsonResult,
  endpoint: string,
): string {
  return `${endpoint} failed (${result.status}): ${snippet(result.text) || "empty body"}`;
}
