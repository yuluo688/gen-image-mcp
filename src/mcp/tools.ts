import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { AppConfig } from "../config.js";
import type { DecodedImage } from "../images/decode.js";
import { MAX_INPUT_IMAGES } from "../images/files.js";
import {
  GEMINI_ASPECT_RATIOS,
  generateGeminiImage,
} from "../providers/gemini-chat.js";
import {
  listConfiguredModels,
  runWithModels,
  type ModelSwitchInfo,
} from "../providers/models.js";
import { editImages, generateImages } from "../providers/openai-images.js";
import type { ImageRegistry } from "../storage/registry.js";
import {
  validateOutputFilename,
  writeImages,
} from "../storage/save.js";
import { redactSecret, UpstreamError } from "../shared/http.js";
import {
  errorResult,
  successResult,
  type AttemptRecord,
  type ExecutionSummary,
} from "./result.js";

function buildSummary(
  startedAt: number,
  attempts: AttemptRecord[],
  switches: ModelSwitchInfo[],
  successfulModel: string | null,
): ExecutionSummary {
  let retry_count = 0;
  for (let i = 1; i < attempts.length; i += 1) {
    if (attempts[i].model === attempts[i - 1].model) retry_count += 1;
  }
  return {
    model: successfulModel ?? attempts.at(-1)?.model ?? null,
    elapsed_ms: Math.round(performance.now() - startedAt),
    attempt_count: attempts.length,
    retry_count,
    model_switches: switches.map((item) => ({
      from: item.from,
      to: item.to,
    })),
    attempts,
  };
}

export function registerTools(
  server: McpServer,
  config: AppConfig,
  registry: ImageRegistry,
): void {
  // 三个工具共享保存、登记和错误处理流程；模型差异仅留在各自的适配器中。
  async function execute(
    args: {
      output_path: string;
      prompt: string;
      model?: string;
      auto_fallback?: boolean;
      filename?: string;
    },
    models: string[],
    generate: (model: string) => Promise<DecodedImage[]>,
  ) {
    const startedAt = performance.now();
    const attempts: AttemptRecord[] = [];
    const switches: ModelSwitchInfo[] = [];
    let successfulModel: string | null = null;
    try {
      validateOutputFilename(args.output_path, args.filename);
      const images = await runWithModels(
        models,
        args.model,
        args.auto_fallback ?? config.autoFallback,
        async (model) => {
          const result = await generate(model);
          successfulModel = model;
          return result;
        },
        {
          onAttempt: (info) => { attempts.push(info); },
          onModelSwitch: (info) => {
            switches.push(info);
          },
        },
      );
      const written = await writeImages(
        images,
        args.output_path,
        args.prompt,
        process.cwd(),
        args.filename,
      );
      // 文件成功写入后才登记资源，避免暴露尚不存在的路径。
      const saved = written.map((item) => {
        const { uri, name } = registry.register(item.absPath, item.mimeType);
        return { ...item, uri, name };
      });
      return successResult(
        saved,
        buildSummary(startedAt, attempts, switches, successfulModel),
      );
    } catch (err) {
      const text = redactSecret(
        err instanceof Error ? err.message : String(err),
        config.apiKey,
      );
      process.stderr.write(`${text}\n`);
      const summary = buildSummary(
        startedAt,
        attempts,
        switches,
        successfulModel,
      );
      const errorMeta =
        err instanceof UpstreamError
          ? {
              ...(err.category !== undefined
                ? { category: err.category }
                : {}),
              ...(err.status !== undefined
                ? { http_status: err.status }
                : {}),
            }
          : undefined;
      return errorResult(text, summary, errorMeta);
    }
  }

  const promptText = z
    .string()
    .refine((value) => value.trim().length > 0, {
      message: "Prompt must not be blank or whitespace-only",
    });
  const outputPath = z
    .string()
    .trim()
    .min(1)
    .describe(
      "File or directory to write. Relative paths resolve against process.cwd().",
    );
  const filename = z
    .string()
    .optional()
    .describe(
      "Optional AI-chosen basename (Unicode allowed, up to 200 UTF-8 bytes, optional extension). Requires output_path to be a directory. Existing names get numbered suffixes instead of being overwritten. Unsafe names are rejected before generation, not rewritten.",
    );
  const inputPath = z.string().trim().min(1);
  const model = z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      "Configured model to start with. Defaults to the first model configured for this tool.",
    );
  const autoFallback = z
    .boolean()
    .optional()
    .describe(
      "Try the next configured model after an upstream failure. Overrides GEN_IMAGE_AUTO_FALLBACK.",
    );
  const quality = z
    .enum(["low", "medium", "high", "auto"])
    .optional()
    .describe("Image quality");
  const size = z
    .string()
    .trim()
    .regex(/^(auto|[1-9]\d*x[1-9]\d*)$/, {
      message: "Size must be auto or positive WIDTHxHEIGHT",
    })
    .optional()
    .describe("Output size, e.g. auto or 1024x1024. Defaults to auto.");

  server.registerTool(
    "list_models",
    {
      description:
        "List configured model groups and the tools that use them. Returns configuration only — not live availability. Does not use network, credentials, or base URL.",
      inputSchema: z.object({}),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const payload = listConfiguredModels({
        models: config.models,
        geminiModels: config.geminiModels,
        autoFallback: config.autoFallback,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: "Configured models only; availability_checked=false means this is not a live availability probe.",
          },
        ],
        structuredContent: payload,
      };
    },
  );

  server.registerTool(
    "generate_image",
    {
      description:
        "Generate images with POST /v1/images/generations (OpenAI Images API). Use for gpt-image-2 and other Images-only models. Do not send those models to chat completions.",
      inputSchema: z.object({
        prompt: promptText.describe("Text prompt for image generation"),
        output_path: outputPath,
        filename,
        model,
        auto_fallback: autoFallback,
        size,
        quality,
        n: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe("Number of images, 1-4. Default 1."),
        output_format: z
          .enum(["png", "jpeg", "webp"])
          .optional()
          .describe(
            "Output encoding. Omit to let the upstream service decide the format.",
          ),
      }),
    },
    async (args) =>
      execute(args, config.models, (model) =>
        generateImages(config, {
          prompt: args.prompt,
          model,
          size: args.size,
          quality: args.quality,
          n: args.n,
          outputFormat: args.output_format,
        }),
      ),
  );

  server.registerTool(
    "edit_image",
    {
      description:
        "Edit or combine local images with POST /v1/images/edits (multipart). Use for gpt-image-2 image-to-image. Do not set input_fidelity for gpt-image-2.",
      inputSchema: z.object({
        prompt: promptText.describe("Edit instruction"),
        output_path: outputPath,
        filename,
        images: z
          .array(inputPath)
          .min(1)
          .max(MAX_INPUT_IMAGES)
          .describe(
            "Local image file paths to send as repeated multipart field `image` (max 16).",
          ),
        mask: inputPath.optional().describe("Optional local mask image path"),
        model,
        auto_fallback: autoFallback,
        size,
        quality,
      }),
    },
    async (args) =>
      execute(args, config.models, (model) =>
        editImages(config, {
          prompt: args.prompt,
          model,
          images: args.images,
          mask: args.mask,
          size: args.size,
          quality: args.quality,
        }),
      ),
  );

  server.registerTool(
    "generate_gemini_image",
    {
      description:
        "Generate or edit images with POST /v1/chat/completions using a Gemini image model. Do not call /v1/images/* for Gemini image models.",
      inputSchema: z.object({
        prompt: promptText.describe("Text prompt"),
        output_path: outputPath,
        filename,
        images: z
          .array(inputPath)
          .max(MAX_INPUT_IMAGES)
          .optional()
          .describe(
            "Optional local image paths sent as user content image_url data URLs (max 16).",
          ),
        model,
        auto_fallback: autoFallback,
        aspect_ratio: z
          .enum(GEMINI_ASPECT_RATIOS)
          .optional()
          .describe("Optional image_config.aspect_ratio"),
      }),
    },
    async (args) =>
      execute(args, config.geminiModels, (model) =>
        generateGeminiImage(config, {
          prompt: args.prompt,
          model,
          images: args.images,
          aspectRatio: args.aspect_ratio,
        }),
      ),
  );
}
