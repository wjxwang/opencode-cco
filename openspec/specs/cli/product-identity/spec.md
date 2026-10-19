# cli/product-identity Specification

## Purpose

定义 opencode-cco 按启动命令区分的对外产品身份：访问大模型及其它对外 HTTP 请求时的 `User-Agent`、出站请求头名、运行时进程名，以及启动命令名——默认 `opencode` 模式与 chatcode 模式各自稳定可预期。

## Requirements

### Requirement: 默认 opencode 模式身份与上游一致

以 `opencode` 或 `opencode2` 命令启动时，产品身份 MUST 与上游 opencode 完全一致：对外请求 `User-Agent` 使用 `opencode/` 前缀格式，进程名与启动命令对应，不得注入 chatcode 标识。

#### Scenario: 默认模式 LLM 请求头

- **WHEN** 用户以 `opencode` 命令启动并发起任一模型 provider 请求
- **THEN** 请求头 `User-Agent` 为 `opencode/<channel>/<version>/<client>` 格式，不包含 `chatcode-cli` 产品串

#### Scenario: 默认模式进程名

- **WHEN** 用户以 `opencode` 命令启动并通过进程表查看该进程
- **THEN** 进程名不为 `chatcode-cli`（保持二进制/启动命令默认名）

#### Scenario: 默认模式出站请求头名

- **WHEN** 以 `opencode` 命令启动并发起模型请求（含无状态 generate）
- **THEN** 出站头包含 `x-opencode-session-id`、`x-opencode-session`、`x-opencode-client` 等原有头名，与上游完全一致

### Requirement: chatcode 模式对外请求使用 chatcode-cli 产品 User-Agent

以 `opencode-cco` 命令启动（chatcode 模式）时，所有经 `App.useragent()` 构造的对外 HTTP 请求 MUST 携带统一产品 `User-Agent`，覆盖大模型主路径、插件/托管 provider、models.dev 与 websearch 插件：

`chatcode-cli/3.0.3 (+https://www.npmjs.com/package/@chatcode/chatcode-cli)`

该值中的版本号 MUST 为字面量 `3.0.3`，不得随本仓库安装版本号漂移。独立硬编码的 UA 常量（如 webfetch）不在本 requirement 范围，两种模式均保持上游值。出站请求头名见「chatcode 模式出站请求头符合 chatcode-cli 访问模式」requirement。

#### Scenario: chatcode 模式主会话 LLM 请求头

- **WHEN** 以 `opencode-cco` 启动，会话向任一模型 provider 发起请求
- **THEN** 请求头 `User-Agent` 等于约定的 chatcode-cli 产品字符串

#### Scenario: chatcode 模式插件/托管 provider 请求头

- **WHEN** 以 `opencode-cco` 启动，Azure、xAI、GitHub Copilot、OpenAI Codex、DigitalOcean、Snowflake、GitLab、Cloudflare 等插件或托管 provider 路径构造带 `User-Agent` 的请求
- **THEN** 其 `User-Agent` 使用与主路径相同的 chatcode-cli 产品身份（可附加 OS 注释），不得再使用 `opencode/` 前缀

#### Scenario: chatcode 模式 models.dev 与 websearch 请求头

- **WHEN** 以 `opencode-cco` 启动，进程经 `App.useragent()` 请求 models.dev 或 websearch 插件（tavily/firecrawl/tinyfish/parallel）
- **THEN** 其 `User-Agent` 为约定的 chatcode-cli 产品字符串，不再使用 `opencode/` 前缀

### Requirement: chatcode 模式出站请求头符合 chatcode-cli 访问模式

以 chatcode 模式启动时，发往模型 provider/gateway 的出站请求 MUST NOT 携带任何 `x-opencode-*` 头名。session 归因 MUST 由中性头 `x-session-affinity` 与 `X-Session-Id` 承担；无状态 generate 路径的归因头 MUST 为 `x-session-affinity`。客户端标识头（`x-opencode-client`）与项目头（`x-opencode-project`）MUST 停发，产品身份仅由 `User-Agent` 承载。默认模式出站头名 MUST 与上游完全一致。client↔server 内部协议头不属于本 requirement，两模式均不变。

#### Scenario: chatcode 模式主路径出站头

- **WHEN** 以 `opencode-cco` 启动并向任一模型 provider 发起请求
- **THEN** 出站头不含任何 `x-opencode-*` 头名，且包含 `x-session-affinity` 与 `X-Session-Id` 承担会话归因（存在父会话时含 `x-parent-session-id`）

#### Scenario: chatcode 模式 generate 归因头

- **WHEN** chatcode 模式触发无状态 generate（标题/摘要类调用）
- **THEN** 会话归因头为 `x-session-affinity`，不为 `x-opencode-session`

#### Scenario: chatcode 模式不发送客户端标识头

- **WHEN** 以 `opencode-cco` 启动并发起 LLM 请求
- **THEN** 出站头不含 `x-opencode-client`，产品身份仅由 `User-Agent` 承载

#### Scenario: OPENCODE_CLIENT 自定义值不泄漏

- **WHEN** 以 `opencode-cco` 启动且设置了 `OPENCODE_CLIENT`（如 `acp`）
- **THEN** 出站头仍不含任何客户端标识头与 `x-opencode-*` 标识，`OPENCODE_CLIENT` 取值不出站

### Requirement: chatcode 模式运行时进程名为 chatcode-cli

以 chatcode 模式启动的 CLI 进程，操作系统进程列表中显示的进程名 MUST 为 `chatcode-cli`，与启动命令文件名解耦。

#### Scenario: chatcode 模式进程可见名称

- **WHEN** 用户以 `opencode-cco` 启动 CLI，并通过进程表查看该进程
- **THEN** 进程名（process title）为 `chatcode-cli`

### Requirement: 后台服务按产品身份隔离

chatcode 模式与默认模式 MUST 各自使用独立的后台服务实例（独立注册文件与独立默认端口），互不发现、可同时运行；后台服务进程的产品身份由其所属模式决定，两模式的 LLM 请求头互不污染。

#### Scenario: 默认服务运行中以 opencode-cco 启动

- **WHEN** 默认模式后台服务已在运行，用户以 `opencode-cco` 启动并发起会话
- **THEN** 客户端不连接默认服务，而是发现或拉起 chatcode 身份的独立服务实例，该实例发出的 `User-Agent` 为约定的 chatcode-cli 产品字符串

#### Scenario: chatcode 服务先运行时以 opencode 启动

- **WHEN** chatcode 身份后台服务已在运行，用户以 `opencode` 启动并发起会话
- **THEN** 客户端连接或拉起默认身份服务实例，其 LLM 请求 `User-Agent` 保持 `opencode/` 前缀，不携带 chatcode 标识

#### Scenario: 连接外部服务

- **WHEN** 以任一启动命令配合 `--server <url>` 连接外部已有服务
- **THEN** 对外请求头以该远端服务自身的身份为准，客户端启动名不改变远端请求头

#### Scenario: standalone 模式

- **WHEN** 以 `--standalone`（或禁用后台服务）启动
- **THEN** 本地服务子进程继承启动命令的产品身份，其 LLM 请求头与该身份一致

### Requirement: 保留 opencode 启动命令并新增 opencode-cco 入口

发布产物与包入口 MUST 继续提供 `opencode` 与 `opencode2` 启动命令，并 MUST 新增 `opencode-cco` 启动命令；三个入口启动同一 CLI 程序，仅产品身份模式不同。

#### Scenario: npm 包启动入口

- **WHEN** 通过 npm 安装本包并调用其声明的 bin 命令
- **THEN** `opencode`、`opencode2`、`opencode-cco` 三个命令均存在且能启动 CLI；`opencode-cco` 进入 chatcode 模式，其余进入默认模式

#### Scenario: 启动模式判定

- **WHEN** CLI 进程以启动命令名 `opencode-cco`（含包装脚本注入的等价环境变量）启动
- **THEN** 进程进入 chatcode 模式；以其它启动名启动时进入默认 opencode 模式
