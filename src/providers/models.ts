import {
  UpstreamError,
  withSameModelRetry,
  type SameModelRetryOptions,
  type UpstreamErrorCategory,
} from "../shared/http.js";

export type AttemptOutcome = "success" | "error";

export type ModelAttemptInfo = {
  model: string;
  outcome: AttemptOutcome;
  elapsed_ms: number;
  error_category?: UpstreamErrorCategory;
  http_status?: number;
};

export type ModelSwitchInfo = { from: string; to: string };

export type RunWithModelsOptions = SameModelRetryOptions & {
  onAttempt?: (info: ModelAttemptInfo) => void;
  onModelSwitch?: (info: ModelSwitchInfo) => void;
};

export type ConfiguredModelGroup = {
  api: "images" | "gemini";
  models: string[];
  default_model: string | null;
  tools: string[];
};

export type ListModelsResult = {
  groups: ConfiguredModelGroup[];
  auto_fallback: boolean;
  availability_checked: false;
};

// Configured models only, not live availability. No network or credentials.
export function listConfiguredModels(config: {
  models: string[];
  geminiModels: string[];
  autoFallback: boolean;
}): ListModelsResult {
  return {
    groups: [
      {
        api: "images",
        models: [...config.models],
        default_model: config.models[0] ?? null,
        tools: ["generate_image", "edit_image"],
      },
      {
        api: "gemini",
        models: [...config.geminiModels],
        default_model: config.geminiModels[0] ?? null,
        tools: ["generate_gemini_image"],
      },
    ],
    auto_fallback: config.autoFallback,
    availability_checked: false,
  };
}

export async function runWithModels<T>(
  models: string[],
  selected: string | undefined,
  autoFallback: boolean,
  generate: (model: string) => Promise<T>,
  options: RunWithModelsOptions = {},
): Promise<T> {
  if (models.length === 0)
    throw new Error("No models configured for this tool");
  const start = selected === undefined ? 0 : models.indexOf(selected);
  if (start === -1)
    throw new Error(`Model is not configured for this tool: ${selected}`);

  // 每次调用从首项或指定模型开始，只向后尝试；不重试本地错误，也不改变全局顺序。
  // 明确的容量不足 / 限流先做同模型有限退避，再按开关切换下一模型。
  for (let index = start; ; index += 1) {
    const model = models[index];
    try {
      return await withSameModelRetry(
        async () => {
          const started = performance.now();
          try {
            const result = await generate(model);
            options.onAttempt?.({
              model,
              outcome: "success",
              elapsed_ms: Math.round(performance.now() - started),
            });
            return result;
          } catch (error) {
            // 仅记录实际上游尝试；本地参数/文件错误不计入 attempt_count。
            if (error instanceof UpstreamError) {
              options.onAttempt?.({
                model,
                outcome: "error",
                elapsed_ms: Math.round(performance.now() - started),
                error_category: error.category,
                ...(error.status !== undefined
                  ? { http_status: error.status }
                  : {}),
              });
            }
            throw error;
          }
        },
        {
          ...options,
          onRetry: (info) => {
            options.onRetry?.(info);
            process.stderr.write(
              `Model ${model} ${info.error.category}; retry ${info.attempt + 1}/${info.maxRetries} in ${info.delayMs}ms: ${info.error.message}\n`,
            );
          },
        },
      );
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      if (!autoFallback || index === models.length - 1) {
        throw new UpstreamError(`Model ${model} failed: ${error.message}`, {
          status: error.status,
          category: error.category,
          retryAfterMs: error.retryAfterMs,
          cause: error,
        });
      }
      const next = models[index + 1];
      options.onModelSwitch?.({ from: model, to: next });
      process.stderr.write(
        `Model ${model} failed; trying ${next}: ${error.message}\n`,
      );
    }
  }
}
