import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { AppConfig } from "../config.js";
import type { DecodedImage } from "../images/decode.js";
import { MAX_INPUT_IMAGES } from "../images/files.js";
import {
  GEMINI_ASPECT_RATIOS,
  generateGeminiImage,
} from "../providers/gemini-chat.js";
import { runWithModels } from "../providers/models.js";
import { editImages, generateImages } from "../providers/openai-images.js";
import type { ImageRegistry } from "../storage/registry.js";
import { writeImages } from "../storage/save.js";
import { errorResult, successResult } from "./result.js";

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
    },
    models: string[],
    generate: (model: string) => Promise<DecodedImage[]>,
  ) {
    try {
      const images = await runWithModels(
        models,
        args.model,
        args.auto_fallback ?? config.autoFallback,
        generate,
      );
      const written = await writeImages(images, args.output_path, args.prompt);
      // 文件成功写入后才登记资源，避免暴露尚不存在的路径。
      const saved = written.map((item) => {
        const { uri, name } = registry.register(item.absPath, item.mimeType);
        return { ...item, uri, name };
      });
      return successResult(saved);
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err);
      process.stderr.write(`${text}\n`);
      return errorResult(text);
    }
  }

  const outputPath = z
    .string()
    .trim()
    .min(1)
    .describe(
      "File or directory to write. Relative paths resolve against process.cwd().",
    );
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

  server.tool(
    "generate_image",
    "Generate images with POST /v1/images/generations (OpenAI Images API). Use for gpt-image-2 and other Images-only models. Do not send those models to chat completions.",
    {
      prompt: z.string().describe("Text prompt for image generation"),
      output_path: outputPath,
      model,
      auto_fallback: autoFallback,
      size: z
        .string()
        .optional()
        .describe("Output size, e.g. auto or 1024x1024. Defaults to auto."),
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
        .describe("Output encoding. Default png."),
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

  server.tool(
    "edit_image",
    "Edit or combine local images with POST /v1/images/edits (multipart). Use for gpt-image-2 image-to-image. Do not set input_fidelity for gpt-image-2.",
    {
      prompt: z.string().describe("Edit instruction"),
      output_path: outputPath,
      images: z
        .array(z.string())
        .min(1)
        .max(MAX_INPUT_IMAGES)
        .describe(
          "Local image file paths to send as repeated multipart field `image` (max 16).",
        ),
      mask: z.string().optional().describe("Optional local mask image path"),
      model,
      auto_fallback: autoFallback,
      size: z.string().optional().describe("Output size"),
      quality,
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

  server.tool(
    "generate_gemini_image",
    "Generate or edit images with POST /v1/chat/completions using a Gemini image model. Do not call /v1/images/* for Gemini image models.",
    {
      prompt: z.string().describe("Text prompt"),
      output_path: outputPath,
      images: z
        .array(z.string())
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
