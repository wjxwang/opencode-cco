# opencode-cco 使用手册

`opencode-cco` 是带双产品身份的 OpenCode 构建：以 `opencode` / `opencode2` 启动时与上游完全一致；以 chatcode 模式启动时，对外访问大模型及其它 HTTP 请求使用 `chatcode-cli` 产品身份。

身份判定（进程内一次求值，两条件任一命中即为 chatcode 模式）：

1. 环境变量 `OPENCODE_IDENTITY=chatcode-cli`
2. 启动命令文件名为 `opencode-cco`（如 `opencode-cco` bin，或指向编译产物的同名符号链接；编译产物经 `process.argv0` 识别调用名，源码 `bun` 方式不可见，请用环境变量）

## 编译

前置条件：Bun `1.4.2`（与仓库 `packageManager` 一致）。Node ≥ 20 仅在使用 `bin/*.cjs` 包装脚本时需要。

```bash
# 安装依赖（仓库根）
bun install

# 完整构建（全部目标平台，需网络与完整工具链；发布用）
bun run --cwd packages/cli build

# 单平台快速构建（本机验证用；--skip-install 跳过平台依赖下载，--skip-web-ui 跳过 Web UI 嵌入）
OPENCODE_CHANNEL=local bun run --cwd packages/cli build --single --skip-install --skip-web-ui
```

- 产物位置：`packages/cli/dist/cli-<os>-<arch>/bin/opencode`（Windows 为 `opencode.exe`）。产物二进制名固定为 `opencode`，chatcode 身份由启动方式注入，与产物文件名解耦。
- 注意：构建脚本在未显式指定 `OPENCODE_CHANNEL` 时通过 `git branch --show-current` 探测通道，需要较新的 git（≥ 2.22）。旧 git 环境请显式传 `OPENCODE_CHANNEL`（如 `local`）。

类型检查与测试（改动代码后）：

```bash
bun run check                      # 仓库根：全量 lint + typecheck
bun test                           # 在各 package 目录下分别运行，勿在仓库根跑测试
```

## 安装与启动

### 开发模式（无需安装）

在仓库根：

```bash
bun run dev                                              # 默认身份（与上游一致）
OPENCODE_IDENTITY=chatcode-cli bun run dev               # chatcode 身份
```

也可以用启动名判定（不依赖环境变量；适用于编译产物，源码 `bun` 方式会解析符号链接导致启动名不可见，请用环境变量）：

```bash
ln -s /path/to/dist/cli-linux-arm64/bin/opencode /usr/local/bin/opencode-cco
opencode-cco            # argv[0] 启动名为 opencode-cco，chatcode 身份
```

### 编译产物

```bash
BIN="$(pwd)/packages/cli/dist/cli-linux-arm64/bin/opencode"

# 方式一：env 直接指定
OPENCODE_IDENTITY=chatcode-cli "$BIN"

# 方式二：经 opencode-cco 包装脚本（shim 自动注入身份与进程名）
OPENCODE_BIN_PATH="$BIN" node packages/cli/bin/opencode-cco.cjs
```

### npm 安装（发布后）

发布后的 `@opencode/cli` 包提供三个 bin（`opencode` / `opencode-cco` / `opencode2`）：

```bash
npm install -g @opencode/cli
opencode-cco        # chatcode 身份；shim 自动注入 OPENCODE_IDENTITY 与进程名
opencode            # 默认身份，与上游一致
```

用本地产物验证时，不要依赖 npm 拉取的已发布平台包，请以 `OPENCODE_BIN_PATH` 指向本地二进制（见上）。

### 连接形态（三种）

1. **共享后台服务（默认）**：CLI 自动发现或拉起 `serve --service` 后台服务。两身份各自使用独立注册文件与独立默认端口，互不发现、可同时运行：
   - 默认模式：`~/.local/state/opencode/service[-<channel>].json`，端口 `0xc0de`（`local` 通道 `0xc0df`）
   - chatcode 模式：`~/.local/state/opencode/service[-<channel>]-cco.json`，端口 `0xf0de`
   - `opencode-cco service start|status|stop|get|set` 只作用于 chatcode 身份的服务实例。chatcode 模式不执行任何 legacy 注册迁移，不会读取或拷贝默认身份的注册与配置。
2. **`--standalone`**：为本次调用启动一次性私有 server（`serve --stdio`），子进程继承环境变量，身份与客户端一致。
3. **`--server <url>`**：连接指定的既有服务。远端服务的请求头以服务端自身身份为准，客户端模式不改变发往模型的请求头。

## 与上游的变更优化简章

| 维度 | 默认模式（`opencode`/`opencode2`） | chatcode 模式（`opencode-cco`） |
| --- | --- | --- |
| 产品 User-Agent | `opencode/<channel>/<version>/<client>`，与上游一致 | 字面量 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`（版本号不随本仓库版本漂移），覆盖 LLM 主路径、插件/托管 provider、models.dev 与 websearch |
| 进程名 | 保持二进制/启动命令默认名 | Linux 下进程表（`top`/`htop`/`ps -o comm`）显示 `chatcode-cli`；`opencode-cco` 包装脚本（Node）在 `ps aux` 中亦显示 `chatcode-cli`。macOS/Windows 无 `/proc`，Bun 子进程进程名不可改 |
| 出站 LLM 请求头 | `x-opencode-session-id`、`x-opencode-session`、`x-opencode-client`、`x-opencode-project` 等全部原头名，与上游一致 | 停发全部 `x-opencode-*`；session 归因仅由中性头 `x-session-affinity` / `X-Session-Id` / `x-parent-session-id` 承担；产品身份仅由 `User-Agent` 承载，客户端标识头与项目头不出站（`OPENCODE_CLIENT` 取值不出站） |
| 无状态 generate 归因头 | `x-opencode-session` | `x-session-affinity`（值语义不变） |
| 后台服务 | 注册文件与端口沿用上游命名；legacy 迁移行为不变 | 独立注册文件 `service[-<channel>]-cco.json`、独立端口 `0xf0de`；跳过全部 legacy 注册/配置迁移；跳过 env 注入的服务子进程经 spawn env 继承 chatcode 身份 |
| 启动入口 | `opencode` / `opencode2`（均保留不变） | 新增 `opencode-cco` bin（`packages/cli/bin/opencode-cco.cjs`） |

**明确保留（两种模式均不变）**：

- Codex `originator`、xAI `referrer`、webfetch 独立 UA 常量等非 `App.useragent()` 路径
- client↔server 内部协议头（`x-opencode-directory`、`x-opencode-ticket` 等）
- 数据目录（`~/.local/share/opencode` 等 XDG 路径）、npm 包名、会话语义
- `packages/server` 服务端零改动
- 默认模式的全部出站头名、注册行为与进程行为与上游完全一致

身份判定、出站头映射与服务隔离的设计依据见 `openspec/changes/rebrand-llm-identity/design.md`。
