import { UpstreamError } from "../shared/http.js";

export async function runWithModels<T>(
  models: string[],
  selected: string | undefined,
  autoFallback: boolean,
  generate: (model: string) => Promise<T>,
): Promise<T> {
  if (models.length === 0)
    throw new Error("No models configured for this tool");
  const start = selected === undefined ? 0 : models.indexOf(selected);
  if (start === -1)
    throw new Error(`Model is not configured for this tool: ${selected}`);

  // 每次调用从首项或指定模型开始，只向后尝试；不重试本地错误，也不改变全局顺序。
  for (let index = start; ; index += 1) {
    const model = models[index];
    try {
      return await generate(model);
    } catch (error) {
      if (!(error instanceof UpstreamError)) throw error;
      if (!autoFallback || index === models.length - 1) {
        throw new UpstreamError(`Model ${model} failed: ${error.message}`);
      }
      process.stderr.write(
        `Model ${model} failed; trying ${models[index + 1]}: ${error.message}\n`,
      );
    }
  }
}
