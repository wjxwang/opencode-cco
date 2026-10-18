# Tasks

## 1. 共享身份谓词

- [x] 1.1 将身份谓词（`OPENCODE_IDENTITY=chatcode-cli` 或启动名 `opencode-cco`）提取到 `@opencode/util` 单点导出（模块加载时求值缓存），供 core/cli 共用（cli 不直接依赖 core）；验证：`bun typecheck`（`packages/core` 与 `packages/cli`）通过，依赖方向无新增违规

## 2. 模式判定、产品 UA 与出站头名

- [x] 2.1 在 `packages/core/src/app.ts` 基于共享谓词让 `useragent()` 在 chatcode 模式返回 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`，默认模式保持 `opencode/${channel}/${version}/${name}`；同步更新依赖 UA 断言的既有测试（默认模式继续断言 `opencode/`，chatcode 模式断言 `chatcode-cli/`）；验证：`bun typecheck`（`packages/core`）通过，`packages/core` 相关 `bun test` 通过且默认/模式两条路径均有覆盖
- [x] 2.2 在 `packages/core/src/session/model-request.ts` 按模式分支出站头：chatcode 模式停发全部 `x-opencode-*`（含 `x-opencode-client`、`x-opencode-project`，session 归因由存量中性 `x-session-affinity` / `X-Session-Id` / `x-parent-session-id` 承担），默认模式保持原头名与 `x-opencode-client: app.name`；验证：单测断言两模式头集合（含 `OPENCODE_CLIENT` 已设置时 chatcode 模式仍无任何客户端标识头与 `x-opencode-*`），`packages/core` 相关 `bun test` 通过
- [x] 2.3 在 `packages/core/src/generate.ts` 使无状态 generate 的会话归因头在 chatcode 模式改名为 `x-session-affinity`（值不变），默认模式保持 `x-opencode-session`；验证：单测断言两模式 generate 请求头名

## 3. CLI 入口与进程名

- [x] 3.1 在 `packages/cli/src/index.ts` 入口按共享谓词设置 `process.title = "chatcode-cli"`（仅 chatcode 模式）；验证：以 `opencode-cco` 启动后 `ps` 中进程 title 为 `chatcode-cli`，以 `opencode` 启动不改 title

## 4. 启动入口 opencode-cco

- [x] 4.1 新增 `packages/cli/bin/opencode-cco.cjs`（与 `opencode.cjs` 同构，注入 `OPENCODE_IDENTITY=chatcode-cli` 后复用 spawn 逻辑），并在 `packages/cli/package.json` `bin` 增加 `"opencode-cco": "./bin/opencode-cco.cjs"`；验证：package.json 与 bin 目录文件名一致，`opencode` / `opencode2` 键保留不变
- [x] 4.2 确认 `packages/cli/script/build.ts` 无需改产物二进制名（包装脚本 spawn 现有 `opencode` 产物）；验证：读 build 脚本确认 `binary` 仍为 `opencode`，若需将 cco 包装脚本纳入发布文件列表则补充并核对产物布局

## 5. 后台服务身份隔离

- [x] 5.1 在 `packages/cli/src/services/service-config.ts` 使 `filename()` 与 `defaultPort()` 按身份模式分支（chatcode：`service-cco.json` / `service-<channel>-cco.json`、端口 `0xf0de`；默认模式命名、端口与迁移行为不变），chatcode 分支跳过 `legacyRegistrationFiles` 中 `service.json` → 本文件的注册拷贝，CLI 调用均经 `ServiceConfig.options()` 显式传 `file`，并在 chatcode 模式经 `ServiceConfig.options()` 返回的 `env` 并入 `OPENCODE_IDENTITY=chatcode-cli`（保证 argv 启动路径拉起的服务子进程继承身份，见 design Decision 7）；验证：两身份服务可同时运行，`service status` 互不可见，pty-handoff 与配置文件按身份分离，仅经 argv 启动（无 env 注入）的 chatcode 客户端所拉起的服务子进程仍为 chatcode 身份（其 LLM 请求 UA 为 chatcode 串），`packages/server` 无改动
- [x] 5.2 回归默认模式服务行为：注册文件名、默认端口、legacy 迁移、`service start/status/stop/get/set` 与改动前完全一致；验证：逐项与上游行为对照或现有服务相关测试通过

## 6. 使用文档 opencode-cco.md

- [x] 6.1 在仓库根新增 `opencode-cco.md`，写明编译命令（`bun install`、`bun run --cwd packages/cli build` 及产物位置）、安装方式与启动命令（`opencode-cco` bin、dev 模式 `OPENCODE_IDENTITY=chatcode-cli bun run dev`、service/standalone/`--server` 三种连接形态说明）；验证：文档中每条命令在干净环境实跑通过
- [x] 6.2 在 `opencode-cco.md` 写与上游的变更优化简章（双产品身份、chatcode 模式 UA/进程名/出站头名——含 `x-opencode-*` 与客户端标识头停发、proposal Impact 中的"明确保留"清单）；验证：与 proposal/spec 表述一致，无遗漏或矛盾

## 7. 集成验证

- [x] 7.1 于仓库根目录运行 `bun run check`；验证：命令退出码 0
- [x] 7.2 按 2×2 矩阵验证：默认/chatcode 两身份后台服务各自独立注册文件与端口、互不发现（`service status` 各只见本身份实例），四种「客户端模式 × 服务模式」组合各触发一次模型请求（或 mock 捕获 headers），核对 UA、进程 title 与出站头名；验证：默认模式无 chatcode 标识且出站头名与上游一致，chatcode 模式 UA/title 为 chatcode 身份且出站头不含 `x-opencode-*`（含仅经 argv 启动的 chatcode 客户端所拉起的服务），两服务可同时运行

## 8. 一键安装与 Release 分发

- [x] 8.1 在 `packages/util/src/identity.ts` 的 basename 比对前剥离 `.exe` 后缀（Windows 安装名 `opencode-cco.exe`），并在 `identity.test.ts` 增加 `opencode-cco.exe` → chatcode、`opencode.exe` → 默认两用例；验证：`packages/util` 目录下测试通过
- [x] 8.2 在仓库根新增 `install-cco`（chmod +x，参照上游 `install`）：平台/AVX2/musl 检测、GitHub Release 下载（`latest/download` 与 `--version <tag>` 两种 URL、env `OPENCODE_CCO_RELEASE_BASE` 覆盖）、安装到 `~/.opencode-cco/bin`（env `OPENCODE_INSTALL_DIR` 覆盖）、`opencode-cco` 真身 + `opencode`/`opencode2` 别名（unix symlink、Windows hardlink/.cmd shim）、`--binary` 本地安装、幂等升级、PATH 写 rc；验证：干净 HOME 下 `--binary` 安装后三命令身份正确（comm：`opencode-cco` → chatcode-cli、`opencode` → opencode），本地 HTTP 服务模拟 `latest/download` 与 `download/<tag>` 完成下载安装，重复执行升级幂等，`--no-modify-path` 不改 rc
- [x] 8.3 新增 `script/release-cco.ts`：校验 12 目标产物 → 打包 `opencode-cco-<target>.tgz` → git tag/push → GitHub API 建 Release（`prerelease:false`）→ 流式上传资产（幂等、重试），凭据走 env `GITHUB_TOKEN`；验证：干跑校验逻辑，正式执行后 Release 含 12 资产且 `releases/latest/download/<asset>` 可下载
- [x] 8.4 全量构建 12 目标（`OPENCODE_CHANNEL=local OPENCODE_VERSION=2.0.28-cco.1 bun run --cwd packages/cli build --skip-web-ui`）并执行发布（tag `v2.0.28-cco.1`）；验证：`dist/` 含 12 个 `cli-<target>`、抽测 linux-arm64 `--version` 输出 `2.0.28-cco.1` 且身份矩阵仍正确，Release 资产齐全
- [x] 8.5 重写 `opencode-cco.md` 为四章节（1 改造点 / 2 编译 / 3 安装——重点全新机器 `curl -fsSL https://github.com/wjxwang/opencode-cco/raw/dev/install-cco | bash`，注明必须 `/raw/` 而非 `/blob/`、升级=重跑、`--version`/`--binary` / 4 使用方法——三命令身份、`--version` 自检、服务连接形态、与上游共存）；验证：文档内命令在干净环境实跑通过
- [ ] 8.6 于仓库根运行 `bun run check`；推送 dev 分支后用真实 raw URL 在干净 HOME 完整 E2E 安装并验证三命令身份；验证：退出码 0，E2E 通过
