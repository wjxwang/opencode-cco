# Proposal

## Why

本 fork（opencode-cco）需要在**不破坏默认 `opencode` 启动方式**的前提下，提供以 chatcode-cli 产品身份访问大模型的启动模式：以 `opencode-cco` 命令启动时，进程名与经 `App.useragent()` 的全部对外请求标识（含 LLM）切换为 chatcode-cli；以 `opencode` 启动时行为与上游完全一致。

## What Changes

- 引入**双模式产品身份**：
  - 默认（`opencode` / `opencode2` 启动）：UA、进程名、bin 名、请求头均与上游一致，零行为变化
  - chatcode 模式（`opencode-cco` 启动）：
    - 运行时 `process.title = "chatcode-cli"`
    - 经 `App.useragent()` 的全部对外 HTTP 请求 UA 切换为 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`（覆盖 LLM 主路径与全部 provider/插件路径）
    - 出站请求头名符合 chatcode-cli 访问模式：停发全部 `x-opencode-*` 出站头（含 `x-opencode-client`、`x-opencode-project`，产品身份仅由 UA 承载），session 归因由存量中性头 `x-session-affinity` / `X-Session-Id` 承担，generate 路径归因头改名 `x-session-affinity`；client↔server 内部协议头两模式不变
    - 后台服务按身份隔离：独立注册文件（`service-cco.json`）与独立默认端口，两模式服务互不发现、可同时运行，服务端代码不改
- 新增启动入口 `opencode-cco`（npm bin 包装脚本 + 运行时按启动名/env 识别模式）；保留 `opencode`、`opencode2`
- 模式判定不改变会话语义、不迁移数据目录；不改 webfetch 等独立硬编码 UA（models.dev、websearch 插件经 `App.useragent`，随模式切换；见 Impact 中明确保留项）
- 同步更新依赖 UA/进程身份断言的单元测试
- 新增仓库根使用文档 `opencode-cco.md`：编译、安装、启动命令与相对上游的变更优化简章

## Capabilities

### New Capabilities

- `cli/product-identity`: 按启动模式区分的对外产品身份——LLM/对外请求 User-Agent、出站请求头名、运行时进程名、启动命令名、后台服务实例隔离——的持久行为约定

### Modified Capabilities

（无；项目当前无既有 specs）

## Impact

- `packages/core/src/app.ts` — `App.useragent()` 与模式感知的产品身份真源
- `packages/core/src/session/model-request.ts` — LLM 主路径 headers（`User-Agent`、出站头按模式分支）
- `packages/core/src/generate.ts` — generate 路径会话归因头按模式改名
- `packages/cli/src/index.ts` — 启动模式识别、`process.title`
- `packages/cli/bin/` 与 `packages/cli/package.json` — 新增 `opencode-cco` bin 入口；保留 `opencode` / `opencode2`
- `packages/cli/script/build.ts` — 仅当需要将 `opencode-cco` 纳入打包/冒烟时调整（默认模式产物不变）
- `packages/cli/src/services/service-config.ts` — 注册文件与默认端口按身份分支（服务隔离）
- `@opencode/util` — 身份谓词单点导出，core/cli 共用
- 相关测试：`packages/core/test/**`、`packages/cli/test/**` 中 UA/进程身份断言
- `opencode-cco.md`（仓库根）— 新增使用文档：编译/安装/启动命令与变更优化简章
- **明确保留**：Codex `originator`、xAI `referrer`、webfetch 独立 UA 常量、`~/.local/share/opencode` 数据目录、npm 包名、client↔server 内部协议头（`x-opencode-directory`/`x-opencode-ticket` 等，两模式均不变）；默认模式 `x-opencode-*` 出站头名与上游完全一致（chatcode 模式停发，见 design Decision 8）
