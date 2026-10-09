# Tool reference

[← Back to README](../README.en.md) · [中文](tools.zh.md)

The following JSON objects are tool arguments, not terminal commands. All three generation/editing tools require `prompt` and `output_path`. Examples omit `model` to use the first model in the corresponding group. `list_models` takes no arguments.

| Tool | Purpose | Upstream endpoint |
| --- | --- | --- |
| `list_models` | List configured models, API groups, defaults and corresponding tools | No network request |
| `generate_image` | Generate images from text | `POST /v1/images/generations` |
| `edit_image` | Edit or combine local images | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini text-to-image or reference-image generation | `POST /v1/chat/completions` |

## generate_image

```json
{
  "prompt": "A red cube on a white table in soft natural light",
  "output_path": "exports/cube.png",
  "size": "1024x1024",
  "quality": "high",
  "n": 1,
  "output_format": "png",
  "auto_fallback": true
}
```

Optional arguments: `filename`, `model`, `size`, `quality`, `n`, `output_format`, `auto_fallback`. `size` defaults to `auto`. `n` is 1–4 and defaults to 1. `quality` accepts `low`, `medium`, `high`, `auto`. `output_format` accepts `png`, `jpeg`, `webp`; if omitted, the upstream service decides the format.

## edit_image

```json
{
  "prompt": "Replace the sky with sunset while preserving building details",
  "output_path": "exports/edited.png",
  "images": ["inputs/photo.png"],
  "auto_fallback": true
}
```

`images` is required and must contain 1–16 local image paths. Optional arguments: `filename`, `mask` (local mask path), `model`, `size`, `quality`, `auto_fallback`. Mask support and editing capabilities depend on the upstream model.

## generate_gemini_image

```json
{
  "prompt": "Turn this sketch into a watercolor painting",
  "output_path": "exports/watercolor.png",
  "images": ["inputs/sketch.png"],
  "aspect_ratio": "16:9",
  "auto_fallback": false
}
```

Omit `images` for text-only generation. Optional arguments: `filename`, `images`, `model`, `aspect_ratio`, `auto_fallback`.

Supported aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`.

## list_models

Call with `{}`. Returns text and `structuredContent` with ordered `groups`, each containing `api` (`images` or `gemini`), `models`, `default_model` and `tools`. Unconfigured groups have empty model lists and `default_model: null`. Top-level `auto_fallback` describes the global setting.

This tool only reads local configuration, makes no network requests, and does not return API keys or service URLs. `availability_checked: false` means configured models have not been checked for live availability.

## AI-provided filenames

The calling AI can provide an optional `filename` based on the image theme. The server does not make an extra model call for naming. All three generation/editing tools support it:

```json
{
  "prompt": "An elegant adult woman in a sunset garden, natural-light photography",
  "output_path": "exports/",
  "filename": "sunset-garden-portrait.png",
  "n": 1
}
```

`filename` is a single basename, not a path. Unicode names are supported, the extension is optional, and the actual image format determines the saved extension. Names are limited to 200 UTF-8 bytes to leave room for suffixes. With this argument, `output_path` must be a directory. Empty names, path separators, Windows reserved names and other invalid names are rejected before generation.

Exclusive creation with numbered suffixes prevents overwrites: `sunset-garden-portrait.png`, `sunset-garden-portrait-2.png`, `sunset-garden-portrait-3.png`, etc., with at most 1000 candidate names. Multiple images receive image indices before handling existing-file conflicts. Omitting `filename` retains the existing naming behavior.

Output paths, file naming and returned content are described in [output.en.md](output.en.md).
