# 参与开发 / Contributing

[中文](#中文) · [English](#english)

## 中文

### Node.js 版本

- **运行**本服务只需要 Node.js ≥ 20（`package.json` 的 `engines`）。
- **开发和跑测试**需要 Node.js ≥ 22.6，推荐 24 LTS（CI 使用 24）。测试文件是 TypeScript，`npm test` 依赖 Node 的 `--experimental-strip-types`，Node 20 和 22.6 之前的版本会直接报错。

### 常用命令

```bash
npm ci            # 安装依赖
npm run build     # 编译到 dist/
npm run typecheck # 只做类型检查
npm test          # 先编译，再运行 test/*.test.ts
npm pack --dry-run # 查看将要发布的文件（只包含 dist/**/*.js 和 README、LICENSE）
```

测试全部使用模拟的 `fetch`，不需要真实的 API Key，也不会访问网络。

### 提交前

- 修改行为时同时更新 `docs/` 下的中英文文档。
- 发版时保持 `package.json`、`package-lock.json` 和 `server.json` 中的版本号一致。

## English

### Node.js version

- **Running** the server only needs Node.js ≥ 20 (`engines` in `package.json`).
- **Developing and running tests** needs Node.js ≥ 22.6; 24 LTS is recommended (CI uses 24). Test files are TypeScript and `npm test` relies on Node's `--experimental-strip-types`, which Node 20 and versions before 22.6 do not support.

### Common commands

```bash
npm ci            # install dependencies
npm run build     # compile to dist/
npm run typecheck # type-check only
npm test          # build, then run test/*.test.ts
npm pack --dry-run # list files that would be published (only dist/**/*.js plus README and LICENSE)
```

Tests mock `fetch`; no real API key or network access is needed.

### Before submitting

- Update the zh and en docs under `docs/` when behavior changes.
- Keep the version in `package.json`, `package-lock.json` and `server.json` in sync when releasing.
