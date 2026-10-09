# 常见问题

[← 返回 README](../README.md) · [English](faq.en.md)

**npx 提示找不到包**

检查包名、版本和 npm 仓库地址。可运行 `npm view gen-image-mcp version --registry=https://registry.npmjs.org` 查询公共仓库中的版本；第三方镜像可能存在同步延迟。

**提示配置缺失或没有可用模型**

检查 MCP 进程是否收到 URL、Key 和至少一组模型环境变量。只配置 Gemini 模型时，请使用 `generate_gemini_image`；只配置 Images 模型时，请使用 `generate_image` 或 `edit_image`。

**命令启动后没有页面或输出**

这是 stdio MCP 服务，不提供 HTTP 服务或网页。有效配置下，它需要由 MCP 客户端连接并发送协议消息。

**找不到生成的图片**

以工具返回的绝对保存路径为准。使用 `npx` 不会把图片自动保存到 npm 包目录；可以直接指定绝对 `output_path`。

**服务地址应该填什么？**

填服务的根地址，不要带 `/v1`，也不要填写具体图像端点。服务会自动拼接 `/v1/images/generations`、`/v1/images/edits` 和 `/v1/chat/completions`。例如网关地址为 `https://gw.example` 时，填写 `https://gw.example`，而不是 `https://gw.example/v1`。

**Images 和 Gemini 两组模型可以使用不同的服务商吗？**

不可以。两组模型共用同一个 `GEN_IMAGE_BASE_URL` 和 `GEN_IMAGE_API_KEY`。

## 开源许可证

本项目采用 [MIT 许可证](../LICENSE)，版权归属 `Copyright (c) 2026 yuluo688`。

允许商用、修改和分发，包括闭源使用；须保留版权及许可证声明。软件按原样提供，不作担保。该许可证适用于本项目软件，不替代上游模型服务条款或对生成图片权利的约定。
