# gen-image MCP

English | [中文](./README.md)

A local MCP server for generating and editing images through OpenAI-compatible APIs. Supports ordered model fallback, saves images locally, and returns previews and resource links.

## Prerequisites

- Install Node.js. Node.js 24 LTS is recommended; the minimum server requirement is 18.3.
- Have an API endpoint, API key and model names supporting the relevant image APIs.
- Use an MCP client that supports stdio.

There is no built-in endpoint, key or model. Missing required configuration prevents startup. `.env` files are not loaded automatically.

## Run with npx

Package: [`gen-image-mcp`](https://www.npmjs.com/package/gen-image-mcp).

Users do not need to clone the source, manually install project dependencies or build the project. `npx` downloads and caches the npm package, then runs it locally; this is not a hosted remote service.

Add a stdio server in your MCP client using:

```text
Command: npx
Arguments: -y gen-image-mcp
```

The following generic example uses `mcpServers`, `command`, `args` and `env`. Client configuration formats may differ; map the command, arguments and environment variables to the corresponding fields.

```json
{
  "mcpServers": {
    "gen-image": {
      "command": "npx",
      "args": ["-y", "gen-image-mcp"],
      "env": {
        "GEN_IMAGE_BASE_URL": "https://your-proxy.example",
        "GEN_IMAGE_API_KEY": "your-api-key",
        "GEN_IMAGE_MODEL": "images-model-a,images-model-b",
        "GEN_IMAGE_GEMINI_MODEL": "gemini-image-model-a",
        "GEN_IMAGE_AUTO_FALLBACK": "true"
      }
    }
  }
}
```

Replace the endpoint, key and model names with actual values. Configure at least one model group; remove the environment variable for an unused group instead of setting it to an empty string. Image files are read and written on the machine running this MCP server. Absolute paths are recommended.

Connect or restart the MCP server after configuring it. The client should discover three tools. When started directly in a terminal, the server waits for MCP messages on standard input; it does not open a web page or an interactive command menu.

For production use, pin the package to a published version, such as `gen-image-mcp@<version>`, to avoid unexpected behavior changes after upgrades. The first run requires access to the npm registry.

### Command-line options

Non-sensitive settings may also be passed as startup arguments. This command assumes `GEN_IMAGE_API_KEY` is already set in the process environment:

```bash
npx -y gen-image-mcp --base-url "https://your-proxy.example" --model "images-model-a,images-model-b" --auto-fallback true
```

Pass the API key through the MCP client's environment configuration to avoid exposing it in shell history or process arguments.

## Configuration

Command-line arguments override environment variables.

| Environment variable | CLI option | Description |
| --- | --- | --- |
| `GEN_IMAGE_BASE_URL` | `--base-url` | Required full HTTP/HTTPS root URL, without credentials, query or fragment; do not supply a specific image endpoint |
| `GEN_IMAGE_API_KEY` | `--api-key` | Required non-empty API key |
| `GEN_IMAGE_MODEL` | `--model` | Comma-separated Images models, in selection order |
| `GEN_IMAGE_GEMINI_MODEL` | `--gemini-model` | Comma-separated Gemini image models, in selection order |
| `GEN_IMAGE_AUTO_FALLBACK` | `--auto-fallback` | `true` or `false`; defaults to `false` |
| `GEN_IMAGE_TIMEOUT_MS` | `--timeout-ms` | Per-request upstream timeout; defaults to `120000` ms; positive integer, maximum `2147483647` |

Model lists must not contain duplicates or empty entries. Invalid URLs, keys or settings cause errors instead of silently selecting a default service or model.

### Model selection and fallback

- Omit the tool's `model` argument to use the first model in its group.
- An explicit `model` must already be configured in that group.
- With automatic fallback enabled, upstream HTTP errors, network errors, timeouts or responses without valid images trigger the next model.
- An explicit model selection starts at that entry and only moves forward; it never wraps to the beginning.
- Each model is tried at most once. Success stops the sequence; if all fail, the last model's error is returned.
- Each new call starts from the first or explicitly selected model, without permanently changing the order.
- Per-call `auto_fallback` overrides the global switch. When false, only the selected model is attempted.
- Invalid arguments, local input errors and save failures do not trigger fallback.
- Models never switch across API groups. Calling a tool with an unconfigured group returns an error.

When fallback is enabled, the client's request timeout should exceed the per-request timeout multiplied by the maximum number of model attempts, with extra time for file I/O. Additional upstream requests may incur additional charges.

## Tools

The following JSON objects are tool arguments, not terminal commands. Every tool requires `prompt` and `output_path`. Examples omit `model` to use the first model in the corresponding group.

| Tool | Purpose | Upstream endpoint |
| --- | --- | --- |
| `generate_image` | Generate images from text | `POST /v1/images/generations` |
| `edit_image` | Edit or combine local images | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini text-to-image or reference-image generation | `POST /v1/chat/completions` |

### generate_image

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

Optional arguments: `model`, `size`, `quality`, `n`, `output_format`, `auto_fallback`. `size` defaults to `auto`. `n` is 1–4 and defaults to 1. `quality` accepts `low`, `medium`, `high`, `auto`. `output_format` accepts `png`, `jpeg`, `webp`; if omitted, the upstream service decides the format.

### edit_image

```json
{
  "prompt": "Replace the sky with sunset while preserving building details",
  "output_path": "exports/edited.png",
  "images": ["inputs/photo.png"],
  "auto_fallback": true
}
```

`images` is required and must contain 1–16 local image paths. Optional arguments: `mask` (local mask path), `model`, `size`, `quality`, `auto_fallback`. Mask support and editing capabilities depend on the upstream model.

### generate_gemini_image

```json
{
  "prompt": "Turn this sketch into a watercolor painting",
  "output_path": "exports/watercolor.png",
  "images": ["inputs/sketch.png"],
  "aspect_ratio": "16:9",
  "auto_fallback": false
}
```

Omit `images` for text-only generation. Optional arguments: `images`, `model`, `aspect_ratio`, `auto_fallback`.

Supported aspect ratios: `1:1`, `2:3`, `3:2`, `3:4`, `4:3`, `4:5`, `5:4`, `9:16`, `16:9`, `21:9`.

## Files and output

- Relative input and output paths resolve against the MCP process's working directory, not the npm cache or package installation directory. Use absolute paths if the working directory is uncertain.
- `output_path` is treated as a directory if it ends in `/` or `\`, points to an existing directory, or has no supported image extension.
- Directory outputs use `{slug}-{YYYYMMDD-HHmmss}[-index].extension`. A Chinese-only prompt uses `image` as the slug; timestamps use local time.
- File outputs retain the specified basename. Multiple images get `-1`, `-2`, etc., and the extension follows the actual image format.
- Missing parent directories are created automatically. Existing paths are overwritten without backup; same-name directory outputs within the same second can also collide.
- A maximum of 16 input images is allowed, with a maximum of 50 MiB per local input file.
- Image responses must contain recognizable PNG, JPEG, WebP or GIF bytes as Base64 or a data URL. Plain remote URLs returned by the upstream service are not downloaded automatically.

### Returned content

A successful call returns, in order:

1. Text containing saved paths and `gen-image:///<id>` resource URIs.
2. An inline preview of the first image, only when its decoded size is at most 2 MiB.
3. A `resource_link` for each image.

Clients can use `resources/list` to list images saved by the current server instance and `resources/read` to retrieve the full Base64 content. Resource reads are not subject to the 2 MiB preview limit. Restarting the server clears its resource list but does not delete saved files.

Tool failures return `isError: true` and error text. stdout is reserved for MCP messages; logs are written to stderr.

## Troubleshooting

**npx cannot find the package**

Check the package name, version and npm registry URL. Run `npm view gen-image-mcp version --registry=https://registry.npmjs.org` to check the version in the public registry. Third-party mirrors may take time to synchronize.

**Missing configuration or no models configured**

Check that the MCP process receives the endpoint, key and at least one model group. With only Gemini models configured, use `generate_gemini_image`; with only Images models, use `generate_image` or `edit_image`.

**The command starts but shows no page or output**

This is a stdio MCP server, not an HTTP server or website. With valid configuration, it waits for a client to connect and send MCP messages.

**Cannot find generated images**

Use the absolute saved path returned by the tool. Running through `npx` does not automatically save images in the npm package directory. You can specify an absolute `output_path` directly.

## License

This project is licensed under the [MIT License](./LICENSE). Copyright (c) 2026 yuluo688.

Commercial use, modification and distribution, including proprietary use, are permitted provided the copyright and permission notices are retained. The software is provided as is, without warranty. This license covers the project software and does not replace upstream model service terms or determine rights to generated images.
