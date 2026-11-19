# Proposal

## Why

fork 的全部 cco 内容（8 个提交、46 个文件、+5576/−86）都压在 `dev` 一个分支上，与上游历史混排：上游（anomalyco/opencode）同步进来时必须穿过 cco 自己的改动，冲突面大、fork 对上游的净差异没有可审阅的落点，也没有任何分支代表"fork 前的 opencode 原状"——且现状下 `dev` 一旦还原为纯上游即丢失全部 cco 提交，没有安全的还原落点。上游节奏使这一问题高频化：fork point（2026-10-13）之后 6 天内上游已推进 **190 个提交**。分支管控的目标是把"纯上游"与"下游改动"拆成两个对象，让同步与审阅各自简单。

## What Changes

- 新建承载全部 cco 改动的工作分支（建议名 `cco`，最终名待定），指向当前 `dev` HEAD `f0d5e531be`；现有 8 个 cco 提交原样随分支保留，运行时身份识别逻辑（启动名触发）**保持现状、不做任何修改**。
- **BREAKING**（仓库管理层面）：`dev` 分支 force-push 重置到 fork point `def5d948ef`（fork 前的 opencode 原状），此后 `dev` 专职为纯上游集成分支，永远可从上游 fast-forward。
- 确立同步流：`anomalyco/opencode → dev（ff，零冲突）→ 合入 cco（冲突只出现在 cco 自有文件）`。
- 修正硬编码的分支 URL（共 3 处）：`install-cco:33-34`、`opencode-cco.md:69/86`、`script/release-cco.ts:181`（Release body 模板）的 `github.com/wjxwang/opencode-cco/raw/dev/install-cco` 在 `dev` 纯化后 404，改为指向新分支或（建议）pin 到 release tag。
- GitHub fork 默认分支从 `dev` 切换到新分支，保留仓库的 cco 发布面貌；Release 与 tag（`v2.0.28-cco.1` → `8a6d88748d`）基于 tag 资产，不受分支重置影响。
- cco 开发的工作约定（基准分支、worktree 起点从 `origin/dev` 换为新分支）需在非上游文件（建议 `opencode-cco.md`）中记录；`AGENTS.md` 为上游文件，保持不动以维持最小 diff。

建议默认值（待评审确认，均可改）：新分支名 `cco`；`dev` 重置目标为 `def5d948ef`（严格"fork 前状态"，上游最新同步作为后续独立操作）；安装 URL pin 到 release tag；8 个提交在新分支上不重写历史。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无：`cli/product-identity` 的全部需求——按启动名区分的 UA、出站头、进程名、服务隔离——行为不变；本变更是纯仓库治理与文档/分发 URL 调整，不改任何产品运行时行为，故本 change 设置 `skip_specs: true`。）

## Impact

- **Git 历史**：`origin/dev` 需 force-push 重写；已有其它 clone 须重建。`dev` 重置前需先添加 upstream remote 并验证 `def5d948ef` 存在于 anomalyco/opencode 的历史中。
- **发布链路**：GitHub Release 资产（tag 驱动的 `latest/download`）不受影响；`install-cco` 一键安装命令若不改 URL 则立即失效，属于必须同步修正项。
- **工具与约定**：`openspec/`、`.opencode/`、`.agents/` 中的 skills/commands 仅存在于新分支——在 `dev` 上 `openspec list` 将显示无 root，属预期；OpenSpec 工作统一在新分支进行。
- **运行时代码**：零改动（`packages/*` 身份识别、服务隔离、bin 包装全部原样保留在新分支上）。

### 核查结论（2026-10-19，只读验证）

- **方案前提全部验证通过**：fork point `def5d948ef` 经 GitHub API 确认存在于 anomalyco/opencode 历史（HTTP 200）；上游默认分支即 `dev`（纯分支与上游 1:1 同名，同步恒为 fast-forward）；`script/lint-changed.ts:45` 的基准解析顺序 `["upstream/dev", "origin/dev", "dev"]` 表明上游工具已预置 upstream remote 工作流，无需改脚本；`publish.yml:44` 有 `if: github.repository == 'anomalyco/opencode'` 守卫，fork 向 dev push 不会触发 npm 发布；README 徽章指向 anomalyco/opencode 的 workflow，不受 fork 分支变动影响；fork 上 0 个 open PR、单 worktree，force-push 无受影响方。
- **收益边界（避免误读）**：拆分**不减少**每次同步的合并冲突量——两方案的三方合并 merge-base 同为 `def5d948ef`，冲突是同一数学计算。实测下次同步的冲突候选 **≥5 个文件**（GitHub compare API 300 文件返回被截断，此为下限）：`packages/cli/package.json`、`packages/cli/src/services/service-config.ts`、`packages/cli/test/service.test.ts`、`packages/core/src/generate.ts`、`packages/core/src/session/model-request.ts`。收益在组织与安全层面：dev 恒可 ff、还原 dev 不再有丢失风险、fork 净差异可随时 `git diff dev..cco` 审阅、cco 提交可经 `format-patch dev..cco` 直接回传上游；冲突被隔离到 cco 分支解决。
- **一次性成本**：force-push `origin/dev`、GitHub 默认分支切换、3 处 URL 修正、`AGENTS.md`（上游文件）"base on `origin/dev`" 约定对 cco 工作失效需在 `opencode-cco.md` 记录例外、每次同步 push 会在 fork 触发 check/test workflow（跑纯上游代码，噪音级）。
