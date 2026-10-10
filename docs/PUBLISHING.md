# 发布渠道与发版流程

本文记录 gen-image-mcp 发布到了哪些第三方平台，以及每次发版要做的事。不包含任何密钥。

## 发布渠道一览

| 渠道 | 地址 | 账号 / 命名空间 | 来源 | 是否自动同步 |
| --- | --- | --- | --- | --- |
| npm | https://www.npmjs.com/package/gen-image-mcp | npm 账号 `fallingcliff` | 本地 `npm publish` | 否，手动 |
| 官方 MCP Registry | https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp | `io.github.yuluo688/gen-image-mcp`（GitHub `yuluo688`） | 仓库根目录 `server.json`，指向 npm 包 | 否，手动 |
| Smithery | https://smithery.ai/servers/kingdiaodu/gen-image-mcp | Smithery 命名空间 `kingdiaodu` | `smithery/` 目录打出的 MCPB 包 | 否，手动 |
| Glama | https://glama.ai/mcp/servers/yuluo688/gen-image-mcp | GitHub `yuluo688`（`glama.json` 中的 maintainers） | GitHub 仓库 | 是 |
| awesome-mcp-servers | https://github.com/punkpeye/awesome-mcp-servers | — | 列表里一行指向本仓库的链接 | 无需更新 |
| GitHub Releases | https://github.com/yuluo688/gen-image-mcp/releases | GitHub `yuluo688` | `vX.Y.Z` 标签 | 否，手动 |

## 各渠道说明

### npm

- 包名 `gen-image-mcp`，账号 `fallingcliff`。
- 仓库**没有** CI 自动发布，需要手动执行 `npm publish`。
- `npm login` 走网页授权；`npm publish` 还会再要求一次网页上的两步验证确认。
- 发布内容由 `package.json` 的 `files` 控制（只含 `dist/**/*.js`、README、LICENSE），可先用 `npm pack --dry-run` 检查。
- npm 上的 README 只在发新版时更新。

### 官方 MCP Registry

- 名称 `io.github.yuluo688/gen-image-mcp`，必须与 `package.json` 的 `mcpName` 一致。
- 在仓库根目录执行：
  ```bash
  mcp-publisher login github   # 用 yuluo688 账号完成设备授权
  mcp-publisher publish
  ```
- 发布前确认 `server.json` 里的 `version` 和 `packages[].version` 与 `package.json` 一致，且对应版本已经发到 npm（Registry 会校验 npm 包）。

### Smithery

- 页面 https://smithery.ai/servers/kingdiaodu/gen-image-mcp ，命名空间 `kingdiaodu`。
- 本地 stdio 服务以 MCPB 包上传，**不会**跟随 npm 自动更新。
- 打包脚本在 `smithery/`（不会进入 npm 包）：
  - `smithery/manifest.json`：MCPB 清单，含配置表单和工具列表，`version` 要与 `package.json` 一致（脚本会校验）。
  - `smithery/server/launch.js`：启动入口。
  - `smithery/build-mcpb.sh`：构建脚本，输出 `smithery/out/server.mcpb`（`out/` 已加入 `.gitignore`）。
- 构建脚本有一步“剥离再替换”：Smithery 要求每个工具带 `inputSchema`，但 `mcpb pack` 不接受 `name`/`description` 以外的字段。所以脚本先用精简版 manifest 打包，再把完整 manifest 写回压缩包。
- 发布：
  ```bash
  bash smithery/build-mcpb.sh
  npx -y @smithery/cli@4.11.1 auth login
  npx -y @smithery/cli@4.11.1 mcp publish smithery/out/server.mcpb -n kingdiaodu/gen-image-mcp
  ```
- 描述、图标、仓库链接 CLI 不会提交，需要在 smithery.ai 服务页面的 Settings 里手动填写。

### Glama

- https://glama.ai/mcp/servers/yuluo688/gen-image-mcp
- 根据仓库里的 `glama.json` 认领，内容从 GitHub 自动同步，无需操作。

### awesome-mcp-servers

- 已收录在 [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) 中，条目链接到 https://github.com/yuluo688/gen-image-mcp ，并带 Glama 评分徽章。只是链接，发版无需更新。

### GitHub Releases

- https://github.com/yuluo688/gen-image-mcp/releases
- 每个版本打 `vX.Y.Z` 标签，并附中英文更新说明。

## 每次发版清单

1. 改版本号（四处保持一致）：
   - `package.json`、`package-lock.json`（`npm version X.Y.Z --no-git-tag-version` 会同时更新这两处）
   - `server.json`（`version` 和 `packages[].version`）
   - `smithery/manifest.json` 的 `version`
   - 服务上报的版本号从 `package.json` 读取，无需手改。
2. 测试：`npm run build && npm test`（需要 Node 22.6+），`npm pack --dry-run` 检查发布文件；合并到 `main` 后确认 CI 通过。
3. 发 npm：`npm publish`（网页登录 + 两步验证）。
4. 发 MCP Registry：`mcp-publisher login github` → `mcp-publisher publish`。
5. 重发 Smithery：`bash smithery/build-mcpb.sh` → `smithery mcp publish ... -n kingdiaodu/gen-image-mcp`。
6. 发 GitHub Release：`gh release create vX.Y.Z --title vX.Y.Z --notes-file <说明文件>`。
7. Glama、awesome 列表无需操作。

---

## English summary

Published to: npm (`gen-image-mcp`, account `fallingcliff`, manual `npm publish` with web login + 2FA, no CI publishing), the official MCP Registry (`io.github.yuluo688/gen-image-mcp`, `mcp-publisher login github` then `mcp-publisher publish` from the repo root, keep `server.json` in sync), Smithery (`kingdiaodu/gen-image-mcp`, MCPB bundle built by `smithery/build-mcpb.sh`, description/icon set in Smithery Settings), Glama (auto-synced from GitHub), punkpeye/awesome-mcp-servers (link only) and GitHub Releases. For each release: bump the version in `package.json`, `package-lock.json`, `server.json` and `smithery/manifest.json`, test, then publish to npm, MCP Registry, Smithery, and create the GitHub release.
