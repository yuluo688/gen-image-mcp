# gen-image MCP

中文 | [English](https://github.com/yuluo688/gen-image-mcp/blob/main/README.en.md)

[![npm version](https://img.shields.io/npm/v/gen-image-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/gen-image-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-active-10B981)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7BB9)](https://github.com/yuluo688/gen-image-mcp/blob/main/LICENSE)

GitHub 项目：[yuluo688/gen-image-mcp](https://github.com/yuluo688/gen-image-mcp) | 已登记 [官方 MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)

**在 Claude Code、Cursor、VS Code 里一句话调用 GPT Image 或 Gemini（Nano Banana）生图、改图，图片直接存进项目目录；模型挂了自动切换到下一个。**

<p align="center"><img src="https://raw.githubusercontent.com/yuluo688/gen-image-mcp/main/docs/demo.gif" alt="gen-image MCP 演示：在 Claude Code 中一句话生成图片并保存到项目" width="720"></p>

## 为什么用它

- **图片直接落到项目里**：保存在运行 MCP 的机器上，代码马上就能引用。
- **用自己的服务和 Key**：任意 OpenAI 兼容的 Images 接口（`gpt-image-2`、`gpt-image-1.5` 等），或经 OpenAI 兼容网关提供的 Gemini 图像模型（Nano Banana 系列）。本项目不托管任何模型。
- **失败自动切换**：容量不足、限流先有限退避重试，再按顺序换下一个模型。
- **生图、参考图、改图全覆盖**：文生图、参考图生成、多图编辑和蒙版，返回内联预览和 `structuredContent`。

## 30 秒上手

需要 Node.js ≥ 20（推荐 24 LTS）。准备好 **服务根地址**（不带 `/v1`，服务会自动拼接 `/v1/images/*` 和 `/v1/chat/completions`）、**API Key**，以及至少一组模型。下面的模型名只是示例，请填写你的服务商实际提供的模型 ID；不用的那组请删掉对应变量，不要留空字符串。

**Claude Code**

```bash
claude mcp add --env GEN_IMAGE_BASE_URL=https://your-gateway.example \
  --env GEN_IMAGE_API_KEY=your-api-key \
  --env GEN_IMAGE_MODEL=gpt-image-2,gpt-image-1.5 \
  --env GEN_IMAGE_GEMINI_MODEL=gemini-3.1-flash-image,gemini-2.5-flash-image \
  --env GEN_IMAGE_AUTO_FALLBACK=true \
  --transport stdio gen-image -- npx -y gen-image-mcp
```

加 `--scope user` 可在所有项目中使用。注意最后一个 `--env` 和服务名之间要隔一个其他参数（如 `--transport stdio`）。

- **Cursor**：[![一键添加到 Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/install-mcp?name=gen-image&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsImdlbi1pbWFnZS1tY3AiXSwiZW52Ijp7IkdFTl9JTUFHRV9CQVNFX1VSTCI6Imh0dHBzOi8veW91ci1nYXRld2F5LmV4YW1wbGUiLCJHRU5fSU1BR0VfQVBJX0tFWSI6InlvdXItYXBpLWtleSIsIkdFTl9JTUFHRV9NT0RFTCI6ImdwdC1pbWFnZS0yLGdwdC1pbWFnZS0xLjUiLCJHRU5fSU1BR0VfR0VNSU5JX01PREVMIjoiZ2VtaW5pLTMuMS1mbGFzaC1pbWFnZSxnZW1pbmktMi41LWZsYXNoLWltYWdlIiwiR0VOX0lNQUdFX0FVVE9fRkFMTEJBQ0siOiJ0cnVlIn19)，安装后在 `~/.cursor/mcp.json` 里把占位地址和 Key 换成真实值。
- **VS Code**：[![在 VS Code 中安装](https://img.shields.io/badge/VS_Code-%E5%AE%89%E8%A3%85_gen--image-0098FF?logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22gen-image%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22gen-image-mcp%22%5D%2C%22env%22%3A%7B%22GEN_IMAGE_BASE_URL%22%3A%22%24%7Binput%3Agen_image_base_url%7D%22%2C%22GEN_IMAGE_API_KEY%22%3A%22%24%7Binput%3Agen_image_api_key%7D%22%2C%22GEN_IMAGE_MODEL%22%3A%22gpt-image-2%2Cgpt-image-1.5%22%2C%22GEN_IMAGE_GEMINI_MODEL%22%3A%22gemini-3.1-flash-image%2Cgemini-2.5-flash-image%22%2C%22GEN_IMAGE_AUTO_FALLBACK%22%3A%22true%22%7D%2C%22inputs%22%3A%5B%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22gen_image_base_url%22%2C%22description%22%3A%22Image%20API%20base%20URL%20(without%20%2Fv1)%22%7D%2C%7B%22type%22%3A%22promptString%22%2C%22id%22%3A%22gen_image_api_key%22%2C%22description%22%3A%22Image%20API%20key%22%2C%22password%22%3Atrue%7D%5D%7D)（会弹窗让你输入地址和 Key）。

**Claude Desktop / Cline / Windsurf 等使用 `mcpServers` 的客户端**

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

**OpenCode**（项目里的 `opencode.json` 或全局 `~/.config/opencode/opencode.json`；Windows 上改为 `"command": ["cmd", "/c", "npx", "-y", "gen-image-mcp"]`）

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

> **各客户端字段名不同**：`env` 还是 `environment`，`command` + `args` 还是单个 `command` 数组，`mcpServers` 还是 `mcp` / `servers`，请按你的客户端文档的格式填写。**Windows 原生环境**：如果服务起不来（`Connection closed`、`ENOENT`），请通过 cmd 启动 npx，例如 `"command": "cmd", "args": ["/c", "npx", "-y", "gen-image-mcp"]`。

重启客户端，应能看到 4 个工具。然后直接说：*“生成一张 16:9 的落地页头图，保存到 public/hero.png。”*

## 工具一览

| 工具 | 用途 | 上游端点 |
| --- | --- | --- |
| `generate_image` | 文生图（尺寸、质量、1–4 张、png/jpeg/webp） | `POST /v1/images/generations` |
| `edit_image` | 编辑或合并 1–16 张本地图片，可加蒙版 | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini 文生图或参考图生成，支持 10 种宽高比 | `POST /v1/chat/completions` |
| `list_models` | 查看已配置的模型组和默认模型（不联网） | 无 |

## 详细文档

[配置说明](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/configuration.zh.md) · [模型选择、失败切换与重试](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/fallback.zh.md) · [工具参数参考](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/tools.zh.md) · [文件、输出与 structuredContent](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/output.zh.md) · [常见问题](https://github.com/yuluo688/gen-image-mcp/blob/main/docs/faq.zh.md) · [参与开发](https://github.com/yuluo688/gen-image-mcp/blob/main/CONTRIBUTING.md)

**许可证**：[MIT](https://github.com/yuluo688/gen-image-mcp/blob/main/LICENSE) © 2026 yuluo688。不替代上游模型服务条款，也不约定生成图片的权利归属。
