import { parseArgs } from "node:util";

export type AppConfig = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  geminiModels: string[];
  autoFallback: boolean;
  timeoutMs: number;
};

function parseModels(value: string | undefined, name: string): string[] {
  if (value === undefined) return [];
  const models = value.split(",").map((model) => model.trim());
  if (models.some((model) => !model)) {
    throw new Error(
      `${name} must contain non-empty, comma-separated model names`,
    );
  }
  if (new Set(models).size !== models.length) {
    throw new Error(`${name} must not contain duplicate models`);
  }
  return models;
}

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2),
): AppConfig {
  // 命令行优先于环境变量；拼错参数或漏填参数值直接报错，不静默兜底。
  const { values } = parseArgs({
    args: argv,
    options: {
      "base-url": { type: "string" },
      "api-key": { type: "string" },
      model: { type: "string" },
      "gemini-model": { type: "string" },
      "auto-fallback": { type: "string" },
      "timeout-ms": { type: "string" },
    },
  });
  const baseUrl = (values["base-url"] ?? env.GEN_IMAGE_BASE_URL)?.trim();
  const apiKey = (values["api-key"] ?? env.GEN_IMAGE_API_KEY)?.trim();
  if (!baseUrl) throw new Error("GEN_IMAGE_BASE_URL / --base-url is required");
  if (!apiKey) throw new Error("GEN_IMAGE_API_KEY / --api-key is required");

  if (!/^https?:\/\//i.test(baseUrl)) {
    throw new Error("GEN_IMAGE_BASE_URL must be an absolute HTTP(S) URL");
  }
  const url = new URL(baseUrl);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "GEN_IMAGE_BASE_URL must be an HTTP(S) URL without credentials, query or fragment",
    );
  }

  // 两类接口分别维护模型顺序，禁止跨接口猜测模型或使用内置模型。
  const models = parseModels(
    values.model ?? env.GEN_IMAGE_MODEL,
    "GEN_IMAGE_MODEL",
  );
  const geminiModels = parseModels(
    values["gemini-model"] ?? env.GEN_IMAGE_GEMINI_MODEL,
    "GEN_IMAGE_GEMINI_MODEL",
  );
  if (models.length === 0 && geminiModels.length === 0) {
    throw new Error("GEN_IMAGE_MODEL or GEN_IMAGE_GEMINI_MODEL is required");
  }

  const autoFallback =
    values["auto-fallback"] ?? env.GEN_IMAGE_AUTO_FALLBACK ?? "false";
  if (autoFallback !== "true" && autoFallback !== "false") {
    throw new Error("GEN_IMAGE_AUTO_FALLBACK must be true or false");
  }
  const timeoutMs = Number(
    values["timeout-ms"] ?? env.GEN_IMAGE_TIMEOUT_MS ?? "120000",
  );
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 2_147_483_647
  ) {
    throw new Error(
      "GEN_IMAGE_TIMEOUT_MS must be an integer between 1 and 2147483647",
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    models,
    geminiModels,
    autoFallback: autoFallback === "true",
    timeoutMs,
  };
}
