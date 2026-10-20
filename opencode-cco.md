# opencode-cco 使用手册

`opencode-cco` 是带双产品身份的 OpenCode 构建：以 `opencode` / `opencode2` 启动时与上游完全一致；以 `opencode-cco` 启动时（chatcode 模式），对外访问大模型及其它 HTTP 请求使用 `chatcode-cli` 产品身份。

## 1. 改造点

身份判定（进程内一次求值，两条件任一命中即为 chatcode 模式）：

1. 环境变量 `OPENCODE_IDENTITY=chatcode-cli`
2. 启动命令文件名为 `opencode-cco`（编译产物经 `process.argv0` 识别调用名，兼容 `.exe` 后缀；源码 `bun` 方式经符号链接启动时解析真实路径，请用环境变量）

| 维度 | 默认模式（`opencode`/`opencode2`） | chatcode 模式（`opencode-cco`） |
| --- | --- | --- |
| 产品 User-Agent | `opencode/<channel>/<version>/<client>`，与上游一致 | 字面量 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`（版本号不随本仓库版本漂移），覆盖 LLM 主路径、插件/托管 provider、models.dev 与 websearch |
| 进程名 | 保持二进制/启动命令默认名 | Linux 下进程表（`top`/`htop`/`ps -o comm`）显示 `chatcode-cli`；`opencode-cco` 包装脚本（Node）在 `ps aux` 中亦显示 `chatcode-cli`。macOS/Windows 无 `/proc`，Bun 子进程进程名不可改 |
| 出站 LLM 请求头 | `x-opencode-session-id`、`x-opencode-session`、`x-opencode-client`、`x-opencode-project` 等全部原头名，与上游一致 | 停发全部 `x-opencode-*`；session 归因仅由中性头 `x-session-affinity` / `X-Session-Id` / `x-parent-session-id` 承担；产品身份仅由 `User-Agent` 承载，客户端标识头与项目头不出站（`OPENCODE_CLIENT` 取值不出站） |
| 无状态 generate 归因头 | `x-opencode-session` | `x-session-affinity`（值语义不变） |
| 后台服务 | 注册文件与端口沿用上游命名；legacy 迁移行为不变 | 独立注册文件 `service[-<channel>]-cco.json`、独立端口 `0xf0de`；跳过全部 legacy 注册/配置迁移；仅经 argv 启动时拉起的服务子进程经 spawn env 继承 chatcode 身份 |
| 启动入口 | `opencode` / `opencode2`（均保留不变） | 新增 `opencode-cco` bin（`packages/cli/bin/opencode-cco.cjs`）与 `install-cco` 安装出的 `opencode-cco` 真身 |

**明确保留（两种模式均不变）**：

- Codex `originator`、xAI `referrer`、webfetch 独立 UA 常量等非 `App.useragent()` 路径
- client↔server 内部协议头（`x-opencode-directory`、`x-opencode-ticket` 等）
- 数据目录（`~/.local/share/opencode` 等 XDG 路径）、npm 包名、会话语义
- `packages/server` 服务端零改动
- 默认模式的全部出站头名、注册行为与进程行为与上游完全一致

### 文件级差异清单（与原 fork 基线的全部不一致）

fork 基线为 `def5d948ef`（上游 opencode 同步历史的最后一笔提交），其后 8 笔本地提交共 46 个文件与上游不一致，分三类列出。fork 更新升级时，AI 可按本清单逐文件判断哪些属于个性化改动：

**（一）补丁进上游包的运行时源码（12 个文件）**——合并上游更新时这些文件会冲突，解冲突目标是「保留 `Identity.chatcode` 分支 + 吸收上游新改动」共存，勿整体取任一侧：

| 文件 | 作用 |
| --- | --- |
| `packages/util/src/identity.ts`、`identity.test.ts`（包内新增） | 身份判定唯一真源 `Identity`：命中 `OPENCODE_IDENTITY=chatcode-cli` 或启动命令名 `opencode-cco`（检查 `argv0`/`argv[0]`/`argv[1]` 的 basename，兼容 `.exe` 后缀；编译产物 `process.argv` 是虚拟路径，调用名仅 `argv0` 可见）即为 chatcode 模式；模块加载时求值一次缓存为 `Identity.chatcode`，下述全部改造点均以它为开关，默认模式不触发 |
| `packages/cli/src/index.ts` | CLI 入口：chatcode 模式设置 `process.title` 并写 `/proc/self/comm`（使 Linux 进程表显示 `chatcode-cli`，写失败不阻塞启动）；默认模式不动 argv 与进程名 |
| `packages/cli/src/services/service-config.ts`、`test/service.test.ts` | 后台服务按身份隔离：注册/配置文件名追加 `-cco`（`service[-<channel>]-cco.json`）、chatcode 专用端口 `0xf0de`、跳过全部 legacy 注册迁移、服务子进程 spawn env 注入 `OPENCODE_IDENTITY`（合并在用户 env 之后，`service set env` 无法覆盖） |
| `packages/core/src/app.ts`、`test/app.test.ts` | `App.useragent()`：chatcode 模式返回字面量 `chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`（版本不随本仓库漂移）；默认模式原样返回 `opencode/<channel>/<version>/<client>` |
| `packages/core/src/generate.ts`、`test/generate.test.ts` | 无状态 generate 归因头 `attributionHeaders()`：chatcode 用 `x-session-affinity`，默认用上游的 `x-opencode-session`（值语义不变） |
| `packages/core/src/session/model-request.ts`、新增测试 `test/session-outbound-headers.test.ts` | 出站头整形 `outboundHeaders()`：chatcode 只发 `x-session-affinity`/`X-Session-Id`/`User-Agent`/（有父会话时）`x-parent-session-id`，停发全部 `x-opencode-*` 及客户端/项目标识；默认模式头集与上游完全一致 |
| `packages/cli/package.json` | `bin` 表新增 `opencode-cco` 条目（指向 `bin/opencode-cco.cjs`） |

**（二）纯新增文件（4 个）**——上游没有对应文件，升级合并不会冲突，直接保留：

| 文件 | 作用 |
| --- | --- |
| `packages/cli/bin/opencode-cco.cjs` | npm 包装入口（Node）：`process.title = "chatcode-cli"` 并注入 `OPENCODE_IDENTITY=chatcode-cli` 后加载 `opencode.cjs`，服务子进程经 env 继承身份 |
| `install-cco`（仓库根） | 一键安装/升级脚本：12 目标检测（OS/arch/AVX2/musl）、GitHub Release 下载、`~/.opencode-cco/bin` 装配三命令、rc 文件 PATH 去重写入 |
| `script/release-cco.ts` | 发布脚本：构建 → 12 平台打包 tgz → git tag → GitHub Release → 流式上传（支持 `--skip-build`/`--dry-run`） |
| `opencode-cco.md`（仓库根） | 本使用手册 |

**（三）openspec 设计记录与 agent 工具（30 个文件）**——不影响产品运行时，升级时保留即可：

| 路径 | 作用 |
| --- | --- |
| `openspec/` | 行为规格与改造记录：`config.yaml`、主规格 `specs/cli/product-identity/spec.md`（升级后可用 `openspec validate --specs` 校验行为契约）、`changes/archive/2026-10-19-rebrand-llm-identity/`（proposal/design/tasks，其中 `design.md` 为设计依据） |
| `.opencode/commands/opsx-*`、`.opencode/skills/openspec-*`、`.agents/skills/openspec-*` | openspec 工作流的斜杠命令与技能文件（仅供 agent 使用） |
| `.opencode/tool/` | 删除 `github-pr-search.ts`、`github-triage.ts`（改留 `github-triage.ts.bak`），agent 工具脚本清理 |

**升级合并指引**：清单之外的文件（含 `packages/server`）与上游一致，可直接快进合并；（一）表逐文件冲突解决且必须保留身份开关（默认模式运行时本就走上游路径，两模式天然共存）；（二）（三）表为本地独有内容，上游更新不含对应改动。

设计依据见 `openspec/changes/archive/2026-10-19-rebrand-llm-identity/design.md`。

## 2. 编译

前置条件：Bun `1.4.2`（与仓库 `packageManager` 一致）。Node ≥ 20 仅在使用 `bin/*.cjs` 包装脚本时需要。git ≥ 2.22 才能自动探测构建通道，旧环境必须显式传 `OPENCODE_CHANNEL`。

```bash
# 安装依赖（仓库根）
bun install

# 发布构建：全部 12 目标平台（channel=local 禁用自动更新，避免本构建被上游 npm 包覆盖）
OPENCODE_CHANNEL=local OPENCODE_VERSION=2.0.28-cco.1 \
  bun run --cwd packages/cli build --skip-web-ui

# 单平台快速构建（本机验证用；--skip-install 跳过平台依赖下载）
OPENCODE_CHANNEL=local bun run --cwd packages/cli build --single --skip-install --skip-web-ui
```

- 产物位置：`packages/cli/dist/cli-<os>-<arch>/bin/opencode`（Windows 为 `opencode.exe`）。产物二进制名固定为 `opencode`，chatcode 身份由启动方式注入，与产物文件名解耦。
- `--skip-web-ui` 不嵌入 Web UI 资源（`channel=local` 下被容忍，TUI 不受影响）。

发布（需 env `GITHUB_TOKEN`，构建 → 打包 → 打 tag → 建 Release → 上传 12 资产一条命令）：

```bash
GITHUB_TOKEN=... bun script/release-cco.ts 2.0.28-cco.1
# 可选：--skip-build 复用已有 dist；--dry-run 只打包并打印计划
```

类型检查与测试（改动代码后）：

```bash
bun run check                      # 仓库根：全量 lint + typecheck
bun test                           # 在各 package 目录下分别运行，勿在仓库根跑测试
```

## 3. 安装

### 全新机器一键安装

```bash
curl -fsSL https://github.com/wjxwang/opencode-cco/raw/dev/install-cco | bash
```

注意 URL 必须是 `/raw/` 形式（直接读取文件内容）；`/blob/` 形式返回的是 HTML 页面，不能用于 `curl | bash`。

脚本行为（参照上游 `install`）：

1. 检测 OS/arch、CPU 是否支持 AVX2（选 `-baseline` 变体）、是否 musl（选 `-musl` 变体），覆盖全部 12 个目标（`linux`/`darwin`/`windows` × `x64`/`arm64` 及其 baseline/musl 变体）
2. 从 GitHub Release 下载 `opencode-cco-<target>.tgz`（默认取最新 Release）
3. 安装到 `~/.opencode-cco/bin` 并写入 shell rc 的 `PATH`（去重、可 `--no-modify-path` 跳过）
4. 创建三个命令：真身 `opencode-cco`（chatcode 身份）+ 符号链接 `opencode`、`opencode2`（默认身份；Windows 为 hardlink + `.cmd`）

### 升级

重新执行同一条安装命令即为升级（幂等替换真身与链接，先显示已装版本再安装）。指定版本钉住：

```bash
curl -fsSL https://github.com/wjxwang/opencode-cco/raw/dev/install-cco | bash -s -- --version v2.0.28-cco.1
```

### 离线与本地产物安装

```bash
./install-cco --binary packages/cli/dist/cli-linux-arm64/bin/opencode
```

### 参数与环境变量

| 项 | 说明 |
| --- | --- |
| `-v, --version <tag>` | 安装指定 Release tag（如 `v2.0.28-cco.1`），默认最新 |
| `-b, --binary <path>` | 跳过下载，安装本地编译产物 |
| `--no-modify-path` | 不修改 shell rc 文件 |
| `OPENCODE_INSTALL_DIR` | 安装目录，默认 `~/.opencode-cco/bin` |
| `OPENCODE_CCO_RELEASE_BASE` | Release 下载基地址，用于镜像或内网代理 |

### 开发模式（无需安装）

在仓库根：

```bash
bun run dev                                              # 默认身份（与上游一致）
OPENCODE_IDENTITY=chatcode-cli bun run dev               # chatcode 身份
```

用启动名判定编译产物（不依赖环境变量）：

```bash
ln -s /path/to/dist/cli-linux-arm64/bin/opencode /usr/local/bin/opencode-cco
opencode-cco            # 启动名为 opencode-cco，chatcode 身份
```

npm 包装方式（发布后 `@opencode/cli` 提供 `opencode` / `opencode-cco` / `opencode2` 三个 bin，`opencode-cco` shim 自动注入身份与进程名）；验证本地产物时用 `OPENCODE_BIN_PATH` 指向本地二进制：

```bash
OPENCODE_BIN_PATH="$BIN" node packages/cli/bin/opencode-cco.cjs
```

## 4. 使用方法

### 命令与身份

| 命令 | 身份 | Linux 进程名 |
| --- | --- | --- |
| `opencode-cco` | chatcode 模式 | `chatcode-cli` |
| `opencode` | 默认模式（与上游一致） | `opencode` |
| `opencode2` | 默认模式（兼容别名） | `opencode2` |

自检：

```bash
opencode-cco --version              # 应输出安装版本，如 opencode v2.0.28-cco.1
ps -o comm -p <pid>                 # opencode-cco 运行中显示 chatcode-cli
```

### 连接形态（三种）

1. **共享后台服务（默认）**：CLI 自动发现或拉起 `serve --service` 后台服务。两身份各自使用独立注册文件与独立默认端口，互不发现、可同时运行：
   - 默认模式：`~/.local/state/opencode/service[-<channel>].json`，端口 `0xc0de`（`local` 通道 `0xc0df`）
   - chatcode 模式：`~/.local/state/opencode/service[-<channel>]-cco.json`，端口 `0xf0de`
   - `opencode-cco service start|status|stop|get|set` 只作用于 chatcode 身份的服务实例。chatcode 模式不执行任何 legacy 注册迁移，不会读取或拷贝默认身份的注册与配置。
2. **`--standalone`**：为本次调用启动一次性私有 server（`serve --stdio`），子进程继承环境变量，身份与客户端一致。
3. **`--server <url>`**：连接指定的既有服务。远端服务的请求头以服务端自身身份为准，客户端模式不改变发往模型的请求头。

### 与上游 opencode 共存

- `install-cco` 安装目录独立（`~/.opencode-cco/bin`），不会覆盖已有上游安装；`PATH` 中目录的先后顺序决定 `opencode` 命令指向哪一个。
- 本构建 `channel=local` 已禁用自动更新（防止被上游 npm 包覆盖而丢失 chatcode 身份）；升级一律通过重新执行 `install-cco` 完成。
- 数据目录与上游共用（同一份会话与配置状态），仅后台服务注册与端口按身份隔离。
