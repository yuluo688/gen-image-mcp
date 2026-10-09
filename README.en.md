# gen-image MCP

English | [中文](https://github.com/yuluo688/gen-image-mcp/blob/main/README.md)

[![npm version](https://img.shields.io/npm/v/gen-image-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/gen-image-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-active-10B981)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7BB9)](https://github.com/yuluo688/gen-image-mcp/blob/main/LICENSE)

GitHub repository: [yuluo688/gen-image-mcp](https://github.com/yuluo688/gen-image-mcp) | Listed in the [official MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)

**Let Claude Code, Cursor, or VS Code generate and edit images with GPT Image or Gemini (Nano Banana) from a single prompt, save them straight into your repo, and fall back to the next model automatically when one is down.**

<p align="center"><img src="https://raw.githubusercontent.com/yuluo688/gen-image-mcp/main/docs/demo.gif" alt="gen-image MCP demo: one prompt in Claude Code, image saved into the project" width="720"></p>

## Why gen-image MCP

- **Files land in your project**: images are written to the machine running the MCP, ready to be referenced by your code.
- **Your own provider, your own key**: any OpenAI-compatible Images API (`gpt-image-2`, `gpt-image-1.5`, …) or Gemini image models (Nano Banana family) behind an OpenAI-compatible gateway. Nothing is hosted by us.
- **Automatic fallback**: capacity / rate-limit errors get bounded retries, then the next configured model is tried.
- **Generate, reference, edit**: text-to-image, reference-image generation, and multi-image editing with masks, plus inline preview and `structuredContent`.

## 30-second quickstart

Requires Node.js ≥ 20 (24 LTS recommended). You need a **base URL** (root only, no `/v1`; the server appends `/v1/images/*` and `/v1/chat/completions`), an **API key**, and at least one model group. Model names below are examples; use whatever IDs your provider exposes, and remove the variable for any group you don't use.

**Claude Code**

```bash
claude mcp add --env GEN_IMAGE_BASE_URL=https://your-gateway.example \
  --env GEN_IMAGE_API_KEY=your-api-key \
  --env GEN_IMAGE_MODEL=gpt-image-2,gpt-image-1.5 \
  --env GEN_IMAGE_GEMINI_MODEL=gemini-3.1-flash-image,gemini-2.5-flash-image \
  --env GEN_IMAGE_AUTO_FALLBACK=true \
  --transport stdio gen-image -- npx -y gen-image-mcp
```

Add `--scope user` to make it available in every project. Keep `--transport stdio` between the last `--env` and the name.

- **Cursor**: [![Add gen-image MCP to Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=gen-image&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdlbi1pbWFnZS1tY3AiXSwiZW52Ijp7IkdFTl9JTUFHRV9CQVNFX1VSTCI6Imh0dHBzOi8veW91ci1nYXRld2F5LmV4YW1wbGUiLCJHRU5fSU1BR0VfQVBJX0tFWSI6InlvdXItYXBpLWtleSIsIkdFTl9JTUFHRV9NT0RFTCI6ImdwdC1pbWFnZS0yLGdwdC1pbWFnZS0xLjUiLCJHRU5fSU1BR0VfR0VNSU5JX01PREVMIjoiZ2VtaW5pLTMuMS1mbGFzaC1pbWFnZSxnZW1pbmktMi41LWZsYXNoLWltYWdlIiwiR0VOX0lNQUdFX0FVVE9fRkFMTEJBQ0siOiJ0cnVlIn19), then replace the placeholder URL and key in `~/.cursor/mcp.json`.
- **VS Code**: [![Install in VS Code](https://img.shields.io/badge/VS_Code-Install_gen--image-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22gen-image%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22gen-image-mcp%22%5D%2C%22env%22%3A%7B%22GEN_IMAGE_BASE_URL%22%3A%22%24%7Binput%3Agen_image_base_url%7D%22%2C%22GEN_IMAGE_API_KEY%22%3A%22%24%7Binput%3Agen_image_api_key%7D%22%2C%22GEN_IMAGE_MODEL%22%3A%22gpt-image-2%2Cgpt-image-1.5%22%2C%22GEN_IMAGE_GEMINI_MODEL%22%3A%22gemini-3.1-flash-image%2Cgemini-2.5-flash-image%22%2C%22GEN_IMAGE_AUTO_FALLBACK%22%3A%22true%22%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22gen_image_base_url%22%2C%22description%22%3A%22Image%20API%20base%20URL%20(without%20%2Fv1)%22%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22gen_image_api_key%22%2C%22description%22%3A%22Image%20API%20key%22%2C%22password%22%3Atrue%7D%5D%7D) (prompts for URL and key).

**Claude Desktop / Cline / Windsurf / other `mcpServers` clients**

```json
{
  "mcpServers": {
    "gen-image": {
      "command": "npx",
      "args": ["-y", "gen-image-mcp"],
      "env": {
        "GEN_IMAGE_BASE_URL": "https://your-gateway.example",
        "GEN_IMAGE_API_KEY": "your-api-key",
        "GEN_IMAGE_MODEL": "gpt-image-2,gpt-image-1.5",
        "GEN_IMAGE_GEMINI_MODEL": "gemini-3.1-flash-image,gemini-2.5-flash-image",
        "GEN_IMAGE_AUTO_FALLBACK": "true"
      }
    }
  }
}
```

**OpenCode** (`opencode.json` in the project or `~/.config/opencode/opencode.json`; on Windows use `"command": ["cmd", "/c", "npx", "-y", "gen-image-mcp"]`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "gen-image": {
      "type": "local",
      "command": ["npx", "-y", "gen-image-mcp"],
      "enabled": true,
      "environment": {
        "GEN_IMAGE_BASE_URL": "https://your-gateway.example",
        "GEN_IMAGE_API_KEY": "your-api-key",
        "GEN_IMAGE_MODEL": "gpt-image-2,gpt-image-1.5",
        "GEN_IMAGE_GEMINI_MODEL": "gemini-3.1-flash-image,gemini-2.5-flash-image",
        "GEN_IMAGE_AUTO_FALLBACK": "true"
      }
    }
  }
}
```

> **Field names differ by client**: `env` vs `environment`, `command` + `args` vs a single `command` array, `mcpServers` vs `mcp` / `servers`. Copy the shape your client documents. **Native Windows**: if the server fails to start (`Connection closed`, `ENOENT`), launch npx through cmd, e.g. `"command": "cmd", "args": ["/c", "npx", "-y", "gen-image-mcp"]`.

Restart the client; it should discover 4 tools. Then just ask: *"Generate a 16:9 hero image for the landing page and save it to public/hero.png."*

## Tools

| Tool | What it does | Upstream endpoint |
| --- | --- | --- |
| `generate_image` | Text → image (size, quality, 1–4 images, png/jpeg/webp) | `POST /v1/images/generations` |
| `edit_image` | Edit or combine 1–16 local images, optional mask | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini text-to-image or reference-image generation, 10 aspect ratios | `POST /v1/chat/completions` |
| `list_models` | Show configured model groups and defaults (no network) | none |

## Detailed docs

[Configuration](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/configuration.en.md) · [Model selection, fallback & retries](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/fallback.en.md) · [Tool reference](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/tools.en.md) · [Files, output & structuredContent](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/output.en.md) · [Troubleshooting / FAQ](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/faq.en.md)

**License**: [MIT](https://github.com/yuluo688/gen-image-mcp/blob/main/LICENSE) © 2026 yuluo688. Does not replace your upstream provider's terms or determine rights to generated images.
