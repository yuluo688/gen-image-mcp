# Troubleshooting / FAQ

[← Back to README](../README.en.md) · [中文](faq.zh.md)

**npx cannot find the package**

Check the package name, version and npm registry URL. Run `npm view gen-image-mcp version --registry=https://registry.npmjs.org` to check the version in the public registry. Third-party mirrors may take time to synchronize.

**Missing configuration or no models configured**

Check that the MCP process receives the endpoint, key and at least one model group. With only Gemini models configured, use `generate_gemini_image`; with only Images models, use `generate_image` or `edit_image`.

**The command starts but shows no page or output**

This is a stdio MCP server, not an HTTP server or website. With valid configuration, it waits for a client to connect and send MCP messages.

**Cannot find generated images**

Use the absolute saved path returned by the tool. Running through `npx` does not automatically save images in the npm package directory. You can specify an absolute `output_path` directly.

**Which base URL should I use?**

Use the service root, without `/v1` and without a specific image endpoint. The server appends `/v1/images/generations`, `/v1/images/edits` and `/v1/chat/completions` itself. For a gateway at `https://gw.example`, use `https://gw.example`, not `https://gw.example/v1`.

**Can the Images and Gemini groups use different providers?**

No. Both model groups share the same `GEN_IMAGE_BASE_URL` and `GEN_IMAGE_API_KEY`.

## License

This project is licensed under the [MIT License](../LICENSE). Copyright (c) 2026 yuluo688.

Commercial use, modification and distribution, including proprietary use, are permitted provided the copyright and permission notices are retained. The software is provided as is, without warranty. This license covers the project software and does not replace upstream model service terms or determine rights to generated images.
