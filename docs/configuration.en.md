# Configuration

[← Back to README](../README.en.md) · [中文](configuration.zh.md)

## Prerequisites

- Install Node.js. Node.js 24 LTS is recommended; the minimum server requirement is 20.
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

Connect or restart the MCP server after configuring it. The client should discover four tools. When started directly in a terminal, the server waits for MCP messages on standard input; it does not open a web page or an interactive command menu.

For production use, pin the package to a published version, such as `gen-image-mcp@<version>`, to avoid unexpected behavior changes after upgrades. The first run requires access to the npm registry.

## Command-line options

Non-sensitive settings may also be passed as startup arguments. This command assumes `GEN_IMAGE_API_KEY` is already set in the process environment:

```bash
npx -y gen-image-mcp --base-url "https://your-proxy.example" --model "images-model-a,images-model-b" --auto-fallback true
```

Pass the API key through the MCP client's environment configuration to avoid exposing it in shell history or process arguments.

## Configuration

Command-line arguments override environment variables.

| Environment variable | CLI option | Description |
| --- | --- | --- |
| `GEN_IMAGE_BASE_URL` | `--base-url` | Required full HTTP/HTTPS root URL, without credentials, query or fragment; do not supply a specific image endpoint (a trailing `/v1` is tolerated and stripped) |
| `GEN_IMAGE_API_KEY` | `--api-key` | Required non-empty API key |
| `GEN_IMAGE_MODEL` | `--model` | Comma-separated Images models, in selection order |
| `GEN_IMAGE_GEMINI_MODEL` | `--gemini-model` | Comma-separated Gemini image models, in selection order |
| `GEN_IMAGE_AUTO_FALLBACK` | `--auto-fallback` | `true` or `false`; defaults to `false` |
| `GEN_IMAGE_TIMEOUT_MS` | `--timeout-ms` | Per-request upstream timeout; defaults to `120000` ms; positive integer, maximum `2147483647` |

Model lists must not contain duplicates or empty entries. Invalid URLs, keys or settings cause errors instead of silently selecting a default service or model.

Model selection, fallback and retry rules are described in [fallback.en.md](fallback.en.md).
