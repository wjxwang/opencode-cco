# Design

## Context

上游重构后 UA 已收敛：`packages/core/src/app.ts` 的 `App.useragent(app)` 返回 `opencode/${channel}/${version}/${name}`，LLM 主路径（`packages/core/src/session/model-request.ts`）与几乎全部插件 provider 均调用该函数。CLI 侧 `App.Info` 在 `packages/cli/src/commands/handlers/default.ts`（及 `server-process.ts`）组装，`name` 取 `OPENCODE_CLIENT ?? OPENCODE_ARTIFACT`。启动入口为 `packages/cli` 的 `opencode` / `opencode2` bin 包装脚本；`OPENCODE_CLI_NAME` 为编译期 define（默认 `"opencode"`）。当前无 `process.title` 设置。

目标：默认启动零变化；`opencode-cco` 启动时进程 title 为 `chatcode-cli`，`App.useragent()` 产出 chatcode 产品串，出站请求头名符合 chatcode-cli 访问模式（无 `x-opencode-*`）。

## Goals / Non-Goals

**Goals:**

- 单一 UA 真源（`App.useragent`）按模式分支，覆盖 LLM 主路径与插件 provider 路径
- 默认 `opencode` / `opencode2` 模式行为与上游一致
- 启动命令、进程 title、UA 三者解耦：chatcode 模式下启动名 `opencode-cco`、title `chatcode-cli`、UA 为约定 chatcode 串

**Non-Goals:**

- 默认模式不改任何头名；client↔server 内部协议头（`x-opencode-directory`、`x-opencode-ticket` 等）两模式均不动。chatcode 模式出站 `x-opencode-*` 的处理见 Decision 8（停发，而非改名保留）
- 不改 webfetch 等独立硬编码 UA 常量；models.dev 与 websearch 插件（tavily/firecrawl/tinyfish/parallel）经 `App.useragent`，实现上随模式切换（spec 已同步扩写）
- 不改 Codex `originator`、xAI `referrer`
- 不迁移数据目录或 chatcode-cli 插件体系
- 不做 npm 发布渠道/包名改造
- 不改 `OPENCODE_CLI_NAME` 编译 define（帮助文案/默认 scriptName 保持 `opencode`；`opencode-cco` 仅由 bin 键与包装脚本表达）

## Decisions

1. **模式真源：启动名 basename 或环境变量**  
   `packages/util/src/identity.ts` 的纯谓词 `Identity.detect(env?, argv?, argv0?)`：`env.OPENCODE_IDENTITY === "chatcode-cli"` 时为 chatcode 模式；否则以 `argv0`、`argv[0]`、`argv[1]` 任一的 `path.basename` 是否为 `opencode-cco` 判定。三项分别覆盖：经 symlink 调用的编译产物（Bun 编译产物的 `process.argv` 为虚拟文件系统路径 `/$bunfs/root/opencode`，真实调用名只在 `process.argv0`，实测 bun 1.4.2）、进程内常规 argv[0]、以及以入口文件名执行的源码运行（如 `bun packages/cli/dist/opencode-cco`）。生产入口用模块加载时缓存的 `Identity.chatcode = detect()`。bin 包装脚本可注入 `OPENCODE_IDENTITY=chatcode-cli` 以覆盖 argv 被改写（如 `bun index.ts`）的场景。  
   备选：仅编译期双二进制——维护成本高且 dev 模式无法覆盖，弃用。备选：仅 argv 检测——在 `node bin` / 自定义调用链下不可靠，故加 env 后路。备选：只看 argv[0]/argv[1]——编译产物 argv 全为虚拟路径，漏掉 symlink 调用名，故补 argv0。

2. **UA 分支放在 `App.useragent()` 内部**  
   `packages/core/src/app.ts` 的 `useragent(app)`：chatcode 模式返回字面量 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`；否则保持现有 `opencode/${channel}/${version}/${name}`。所有已收敛调用点自动跟随，无需改插件文件。`3.0.3` 写死常量，不绑定 `OPENCODE_VERSION`（对齐现网 chatcode-cli CLI 版本；备选绑定安装版本——与目标串不一致，弃用）。

3. **客户端标识头仅默认模式发送，chatcode 模式停发**  
   默认模式 `model-request.ts` 的 `x-opencode-client` 保持 `app.name`（含 `OPENCODE_CLIENT=acp` 等自定义值），与上游一致。chatcode 模式不发送该头（及全部 `x-opencode-*`，见 Decision 8）：出站请求不携带任何客户端产品标识，产品身份仅由 `User-Agent` 承载，`OPENCODE_CLIENT` 自定义值因此不会出站。依据：chatcode-cli 实测不发客户端产品头，停发同时消除头名与取值两个暴露面（取代早先"改名并强制取值 `chatcode-cli`"的方案）。

4. **`process.title = "chatcode-cli"` 仅在 chatcode 模式**  
   放在 `packages/cli/src/index.ts` 入口，在模式判定后立即设置；默认模式不触碰 title。dev 与编译产物行为一致。  
   Bun 运行时限制（实测 bun 1.4.2）：`process.title` 只是属性赋值，不改 OS 进程表可见名（Bun 未实现 Node 式 argv 重写）。补偿：Linux 下 chatcode 模式另写 `/proc/self/comm`（`top`/`htop`/`ps -o comm` 显示 `chatcode-cli`；best-effort，沙箱化 /proc 失败不影响启动）；`opencode-cco.cjs` shim 跑在 Node 下，其 `process.title` 真实生效（`ps aux` 的 COMMAND 显示 `chatcode-cli`）。`ps aux` 中 bun 子进程的 args 列在 Bun 下不可改（显示 spawn 命令 `opencode`/`bun …`，与上游一致）；macOS/Windows 无 `/proc`，Bun 子进程进程名不可改，shim 层仍生效。

5. **bin：新增 `opencode-cco.cjs`，保留 `opencode` / `opencode2`**  
   `packages/cli/package.json` 增加 `"opencode-cco": "./bin/opencode-cco.cjs"`（`files: ["bin"]` 自动纳入发布）。包装脚本设置 `process.title = "chatcode-cli"`（Node 下真实改写 `ps aux` 显示）与 `process.env.OPENCODE_IDENTITY = "chatcode-cli"` 后复用现有 spawn 逻辑（与 `opencode.cjs` 同构，spawn 的二进制名仍为编译产物 `opencode`，不改 `script/build.ts` 的 `binary` 常量）。

6. **Bun `execArgv --user-agent=` 保持上游默认**  
   该值仅是进程级 fetch 默认 UA；LLM/插件路径均显式设置 `User-Agent`。若后续发现有未覆盖的裸 fetch，再评估按模式注入——当前不在最小范围。

7. **后台服务按身份隔离：注册文件与默认端口按模式分支**  
   `ServiceConfig.filename()` 与 `defaultPort()` 按身份模式分支：默认模式保持 `service.json` / `0xc0de`（channel 命名与迁移行为完全不变）；chatcode 模式使用独立注册文件（`service.json` → `service-cco.json`，`service-<channel>.json` → `service-<channel>-cco.json`）与独立默认端口 `0xf0de`（避开 `0xc0de`/`0xc0df` 及 channel 派生端口段 10000–59999）。  
   读写同源：客户端 `Service.ensure/discover/stop` 的 `options.file` 与 `server-process.ts:68` 的 `defaultPort()` 都出自这两个函数，注册文件隔离后 pty-handoff（`<file>.pty-handoff`）与配置文件（password/cors/port）自然按身份分离，`packages/server` 零改动。两身份服务可同时运行、互不发现；`opencode service *` 与 `opencode-cco service *` 各自作用于本身份实例。  
   实现要点（防身份泄漏回灌）：  
   - chatcode 分支**不得**执行 legacy 迁移中"`service.json` → 本文件"的注册拷贝（`paths().legacyRegistrationFiles`，本为 channel 变更场景设计），否则会把默认服务的注册信息拷进 chatcode 文件，客户端重新发现默认服务；config 迁移同理仅限默认模式。  
   - CLI 全部调用必须经 `ServiceConfig.options()` 显式传 `file`，不得落到 client 侧 `fallback()` 默认注册文件。  
   - 身份谓词（`OPENCODE_IDENTITY=chatcode-cli` 或启动名 `opencode-cco`）提取到 core 与 cli 共同依赖的 `@opencode/util` 单点导出，`core/app.ts`（UA）、`cli/service-config.ts`（文件/端口）、`cli/index.ts`（`process.title`）共用同一真源（cli 不依赖 core）。  
   - 身份向服务子进程传播：`Service.ensure` 的 spawn 命令 argv 名（`opencode` 产物 / `bun …/index.ts`）无法表达 chatcode 身份，服务子进程只能靠 env 继承。当 chatcode 模式仅经 argv 判定（如 `opencode-cco` 符号链接直达二进制、未注入 env）时，客户端 `process.env` 无 `OPENCODE_IDENTITY`，拉起的服务会误判为默认模式，其 LLM UA 回退为 `opencode/` 前缀。故 chatcode 模式下 `ServiceConfig.options()` 在返回的 `env` 中并入 `OPENCODE_IDENTITY=chatcode-cli`（合并顺序置于用户 env 之后，不被 `service set env` 同名键覆盖）；`packages/client` 的 `spawnServiceContender` 已按 `options.env` 透传，零改动。  
    `--standalone` 不受影响（本地子进程 `extendEnv` 继承 env）；`--server <url>` 以远端服务身份为准，客户端模式不改变远端请求头。

8. **出站请求头名按模式分支：chatcode 模式停发全部 `x-opencode-*`**  
   实测依据（本机安装的 `@chatcode/chatcode-cli@3.0.3` 及其 LLM 客户端 `@earendil-works/pi-ai`）：其出站 LLM 请求头为 `User-Agent` + provider auth（`authorization`/`x-api-key`/`anthropic-version`）+ 按 provider compat 发出的 session 归因头（`x-session-id` / `session_id` / `x-client-request-id` / `x-session-affinity`）；零 `x-opencode-*`、零客户端产品头、零 project 头。  
   映射（默认模式所有头保持原样）：

   | 现状出站头 | chatcode 模式 | 依据 |
   |---|---|---|
   | `x-opencode-session-id` | 停发 | 存量中性 `X-Session-Id` 已承担归因（≡ pi-ai `x-session-id`，HTTP 头名大小写不敏感）；改名会与其撞头 |
   | `x-opencode-session` | 停发 | `x-session-affinity`（≡ pi-ai 同名、同值）已在发 |
   | `x-opencode-parent-session-id` | 停发 | 中性 `x-parent-session-id` 同值已在发 |
   | `x-opencode-project` | 停发 | chatcode 无对应头 |
   | `x-opencode-client` | 停发 | 见 Decision 3 |
   | `generate.ts` 的 `x-opencode-session` | 改名 `x-session-affinity`（值不变） | 该调用无其它归因头，gateway 需要会话归因，不能停发 |

   中性头 `x-session-affinity` / `X-Session-Id` / `x-parent-session-id` 两模式均保留（已是 chatcode/pi-ai 访问头名、无 opencode 字样）。范围仅出站至 provider/gateway 的请求（`packages/core/src/session/model-request.ts` 与 `packages/core/src/generate.ts`，全仓核查仅此两处）；client↔server 内部协议头两模式不动。

9. **一键安装脚本 `install-cco` 与 GitHub Release 分发**  
   仓库根新增 `install-cco`（bash，参照上游 `install`）：`curl -fsSL https://github.com/wjxwang/opencode-cco/raw/dev/install-cco | bash` 即装即升级。平台/AVX2（baseline）/musl 检测逻辑与上游一致，覆盖全部 12 个上游目标矩阵（`linux-x64{,-baseline,-musl,-baseline-musl}`、`linux-arm64{,-musl}`、`darwin-x64{,-baseline}`、`darwin-arm64`、`windows-x64{,-baseline}`、`windows-arm64`）；下载源改为 GitHub Release 资产 `{base}/latest/download/opencode-cco-<target>.tgz`（`--version <tag>` 时 `{base}/download/<tag>/...`），base 可由 env `OPENCODE_CCO_RELEASE_BASE` 覆盖（镜像与本地 HTTP 实测）。安装目录独立为 `$HOME/.opencode-cco/bin`（env `OPENCODE_INSTALL_DIR` 可覆盖，避免覆盖既有上游安装），装三个命令名：真身 `opencode-cco[.exe]`（chatcode 身份）+ `opencode`、`opencode2`（默认身份）。unix 下两个别名必须是 symlink/exec-hardlink 而非 exec shim——shim 会把 argv0 变成真身名导致身份误判；Windows 用 hardlink（回退 copy）建 `opencode.exe` 加 `.cmd` shim。`--binary <path>` 跳过下载直接安装本地产物；重复执行即升级（幂等替换真身与链接）；PATH 写 rc 与去重沿用上游逻辑。安装 URL 必须用 `/raw/` 路径（`/blob/` 返回 HTML，不可用于 `curl | bash`）。  
   备选：复用上游 `~/.opencode/bin`——会覆盖既有上游 `opencode` 二进制，弃用。备选：只装 `opencode-cco` 单名——新机器缺少默认身份命令，弃用。

10. **发布版本 `2.0.28-cco.1`、channel 固定 `local`、发布脚本 `script/release-cco.ts`**  
    版本对齐上游基线（repo root 2.0.28）加 `-cco.1` 后缀，tag `v2.0.28-cco.1`；构建一律 `OPENCODE_CHANNEL=local OPENCODE_VERSION=2.0.28-cco.1`（env 优先级实测确认：`OPENCODE_CHANNEL` 先于 `OPENCODE_VERSION→latest` 规则）。channel=local 三重必要：`OPENCODE_LOCAL` 禁用 autoupdate（否则 `opencode update` 会拉上游 npm 包覆盖本构建、chatcode 身份丢失）；`--skip-web-ui` 下 Web UI 缺失被容忍（TUI 不受影响）；git 2.20 无 `--show-current`，channel 探测不可用。发布脚本（bun）：校验 `dist/cli-<target>/bin/opencode[.exe]` 齐全 → 各目标打包 `opencode-cco-<target>.tgz`（资产名不含版本号以支持 `latest/download`）→ git tag/push → GitHub API 建 Release（`prerelease:false`）→ 流式上传 12 资产（幂等：已存在则跳过）。凭据走 env `GITHUB_TOKEN`。checksum 校验资产暂不做（YAGNI，TLS+GitHub 与上游 npm 信任级相同）。  
    备选：GitHub Actions 构建上传——runner 无法本机实测 chatcode 身份且需 CI 密钥配置，弃用（后续可迁）。

11. **身份谓词对 Windows 可执行名归一化（Decision 1 补充）**  
    `Identity.detect` 比对前对 basename 做 `.replace(/\.exe$/i, "")`：Windows 安装名为 `opencode-cco.exe`，不归一化则 chatcode 身份恒检测不到；`opencode.exe` 归一化后仍为默认身份，不产生误判。

## Risks / Trade-offs

- [用户以非 bin 方式启动（如 `bun packages/cli/src/index.ts`）漏进 chatcode 模式] → 设计为 argv 名或 `OPENCODE_IDENTITY` 双通道；文档要求用 `opencode-cco` 或显式 env
- [网关按 `x-opencode-*` 头名或旧 UA 做策略] → chatcode 模式停发出站 `x-opencode-*`（默认模式头名不变）；若某网关依赖这些头名做会话路由，需在该网关侧同步（用户侧确认）。若网关白名单 `opencode/` UA，同样需运维同步
- [测试断言散布] → 默认模式用现有 `/^opencode\//` 断言；chatcode 模式用共享常量或 `stringContaining("chatcode-cli/")`，避免写死完整串导致版本摩擦
- [`App.useragent` 读 env 引入隐式全局] → 判定函数在模块加载时一次性求值并缓存，保持纯读；测试可直接调用带参的分支
- [某平台交叉编译或跨平台 PTY/parcel-watcher 依赖下载失败] → 12 目标相互独立，剔除失败目标并告知用户；install-cco 对缺失资产 404 报错兜底
- [Release 资产约 1GB、上传耗时长] → 发布脚本流式上传+重试，幂等跳过已存在资产，可中断重跑
- [Windows/darwin/musl/baseline 无法本机实测] → 依赖构建自带 `NativeArch.verify`/`verifyArtifact`；`opencode-cco.md` 如实声明验证边界
- [channel=local 禁用自动更新] → 设计使然（防上游 npm 包覆盖 chatcode 身份）；升级 = 重跑 `install-cco`，文档写明

## Migration Plan

1. 实现后 `bun run check`（根目录）+ 相关包 `bun test`
2. 默认模式启动 `--help` / `--version` 与上游一致；`opencode-cco --version` 同二进制但 title/UA 为 chatcode 模式；两模式后台服务以独立注册文件/端口并存且互不发现（Decision 7）
3. 回滚：revert 提交即可；无数据迁移

## Open Questions

（无；原「后台服务身份归属」已按方案 (a) 决策为 Decision 7——按身份隔离服务实例）
