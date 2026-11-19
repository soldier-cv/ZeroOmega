# ZeroOmega 私有 Fork — Agent 工作规约（AGENTS.md）

> 适用于任何在本仓库工作的 agent（含 AI 与人类协作者）。**开工前先读第 1 节。**
> 本文件只放当前有效的约束与指导。实现过程、测试状态与历史决策在 `docs/requirements-log.md`（历史档案，按 R 编号组织）。

## 0. 项目定位与 fork 策略（硬性）

- 本仓库 `soldier-cv/ZeroOmega` 是 [zero-peak/ZeroOmega](https://github.com/zero-peak/ZeroOmega) 的**个人 fork**，自用定制。上游是 SwitchyOmega 的 Manifest V3 继任者。
- fork 基线：**v3.5.2**（commit `c367db2`，2026-09-09），fork 创建于 2026-10-16。
- **不主动与上游同步（硬性约定）**：
  - 不自动合并 / 跟随上游改动；不向上游提交 PR、issue 或任何回馈；
  - 仅当华总明确下达“同步上游 / 合并上游”指令时才执行，执行前先确认范围与冲突处理方式；
  - 讨论、设计与实现均以本仓库自身为准，不得以“上游是这么做的”为由改动代码或推翻既有决策。

## 1. 任务开始前的第一件事（硬性）

**先确认“需求是否已经被满足 / 已经可用”，再决定是否动手。** 具体：

1. 对照第 3 节索引、`docs/requirements-log.md` 与代码现状，给出明确结论之一：
   - **已满足** → 报告现状与用法，不要重复实现；
   - **部分满足** → 先说明现有入口 / workaround 与差距，再谈实现；
   - **未满足** → 进入设计与实现流程。
2. 必要时先查 ai-memory（`memory_query`）与 git 历史，避免重复劳动。
3. 需求或状态有变化时：第 3 节只更新一行索引；背景 / 实现 / 验证写入 `docs/requirements-log.md`；仍有效的约束写入第 5 节（每条 ≤3 行）。关键结论同步到 ai-memory。

## 2. 通用规矩

1. 动手前先读相关模块的现有代码；保持与周围代码一致的结构与风格（CoffeeScript / 原生 JS / Jade / Less 并存，见第 4 节）。
2. 改动小而聚焦；**不做顺手的大重构、不更换技术栈、不做“追新”式依赖升级**（见决策 D2）。
3. 不新增运行时依赖，除非确有必要并在提交/说明中给出理由（扩展对包体积敏感）。
4. 面向用户的文案按现有 i18n 流程补充（`omega-locales`，以 `en_US` 为源）；本 fork **同步维护 `zh_CN`**（华总界面语言，避免依赖 Weblate 回流）；其它语言由 Weblate 托管，**不要手改**。
5. 改动需考虑 Chrome 与 Firefox 两个 target 的差异（代码用 `globalThis.localStorage` 等特征分支区分，参见 `omega-target-chromium-extension/overlay/x-background.js`）。
6. Git 提交信息**必须使用中文**，推荐 Conventional Commits 前缀 + 中文简述，如 `feat: 支持当前子域级临时路由`。
7. **发布（发版）仅在华总明确指令时执行**：版本号递增 → CHANGELOG → 打 tag → 推送远端触发流水线；不得自作主张发布。tag 一律打在 `custom_main` 的发布提交上（见第 12 条）。
8. 涉及临时规则（temp rule）的改动，注意 SwitchProfile 的**首条命中生效**语义与规则顺序（详见 R1）。
9. **推送纪律（硬性）**：agent 只做**本地提交**；`git push`（含 `--force`、推 tag、推分支）必须华总明确指令才执行，**尤其禁止擅自推送到上游仓库**（与第 0 节 / D3 一致）。
10. **代码与注释规范**：
    - 遵循所在模块的既有风格与命名，不引入新的写法体系；同一处改动不要顺手换风格。
    - 注释只写「为什么」和非显然的约束（如兼容性分支、顺序依赖、失败可容忍的原因），**不复述代码**、不写 `// 设置 xxx` 这类无信息量注释。
    - **减少不必要的方法提取**：只被调用一次、且不构成独立概念的逻辑不要抽成函数 / 类；宁可留在调用点保持可读。避免为了「看起来分层」而加包装、转发方法或一次性中间变量。
    - 不新增死代码、不保留「将来可能用到」的开关与参数。
11. **性能意识**：
    - popup / 设置页在渲染路径上避免重复的 DOM 查询与重复计算（节点引用与派生结果缓存在闭包内，只在必要时重算）；避免引发无谓的重排。
    - 扩展启动路径（background / service worker）不做阻塞式重活；网络与存储操作一律异步，且**失败可容忍**（不因远端不可达而中断启动，如 R7 的备份快照重建）。
    - 改动涉及规则匹配 / PAC 生成时，注意不要引入 O(n²) 或每次请求都重算的开销。
12. **分支纪律（硬性）**：所有开发、提交、打 tag 都在 **`custom_main`** 上进行；`master` 只作为上游基线（v3.5.2，与 `origin/master` 同步），**不在 master 上提交、不在 master 上打 tag**。发版 tag 打在 `custom_main` 的发布提交上，不要为 tag 单独切分支或合并到 master。
13. **打 tag 前必须核对（硬性）**：tag 指向的提交必须同时满足三条，否则打错了流水线会发出旧版本（v3.7.2 曾把 tag 打在纯文档提交上，分发产物是 3.7.1）：
    - `overlay/manifest.json` **与** `overlay/manifest-firefox.json` 的 `version` 都等于 tag 名去掉 `v`（两份 manifest 各自生成 chromium / firefox 包，只改一份会发出版本不一致的包）；
    - `CHANGELOG.md` 有该版本段落；
    - `.github/workflows/release.yml` 是该提交自己的版本（GitHub Actions 只读 tag 指向提交的 workflow，打在旧提交上会用旧的 CI 配置构建；流水线另有「包内版本 == tag」与发布说明段落两道复核）。
    tag 打在合并提交上时，须确认发布提交与 CI 改动都在其祖先里。

## 3. 需求台账（Requirements Ledger）

> 只留一行索引。新需求追加一行；背景 / 实现 / 验证 / 相关代码写入 `docs/requirements-log.md`，不要写回本文件。

R1. 当前子域级临时路由（Temp Rule） — 状态：已验证（2026-10-16；单元测试 + 实机验证通过）→ 详见 docs/requirements-log.md#r1
R2. （已澄清，无需实现）直连 / 系统代理 的使用习惯 — 状态：关闭（2026-10-16）→ 详见 docs/requirements-log.md#r2
R3. 稳定性与可维护性（非功能） — 状态：方针已确认，按需执行→ 详见 docs/requirements-log.md#r3
R4. popup 菜单重构美化 + 本页路由表达 — 状态：已验证（2026-10-16；本地预览逐场景核验 + 实机确认）→ 详见 docs/requirements-log.md#r4
R5. popup「本页覆盖」互斥开关 + 两列表一致性 — 状态：已被 R9 取代（2026-10-16）→ 详见 docs/requirements-log.md#r5
R6. 设置页精简（移除高级条件开关 / 快速切换 / 旧版规则导出） — 状态：已完成并提交（2026-10-16；提交 `4437f28`）→ 详见 docs/requirements-log.md#r6
R7. WebDAV 自动备份 / 恢复（替代 Gist 同步与在线恢复） — 状态：代码完成，构建与测试通过，待实机确认（2026-10-16）→ 详见 docs/requirements-log.md#r7
R8. iOS 风格主题改造 + 设置页打磨 — 状态：代码完成，构建通过，本地预览已核验（2026-10-16）→ 详见 docs/requirements-log.md#r8
R9. popup 简化为「全局 / 当前」一个按钮 + 一套列表 — 状态：已被 R10 取代（2026-10-16；实现记录保留）→ 详见 docs/requirements-log.md#r9
R10. popup 交互收敛 + 三套内置主题（iOS / 莫兰迪绿 / Claude Code） — 状态：构建与本地预览已核验，待实机确认（2026-10-18）→ 详见 docs/requirements-log.md#r10
R11. popup 本页 / 全局互不污染 — 状态：构建与交互校验通过，待实机确认（2026-10-20）→ 详见 docs/requirements-log.md#r11
R12. popup 记住「全局 / 本页」与作用域 + 子域上可见继承的整域规则 — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-10-28）→ 详见 docs/requirements-log.md#r12
R13. popup 交互收敛：点击即应用、撤销显式化、说明实际路由 — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-10-28）→ 详见 docs/requirements-log.md#r13
R14. 扩展内更新检查（发布清单 → 复制命令 → 重载扩展） — 状态：构建通过，真实服务器与真实 Chromium 校验通过，待实机确认（2026-10-28）→ 详见 docs/requirements-log.md#r14
R15. 版本查询接口（`/res/zeroomega/version.json` + `version.txt`） — 状态：脚本与 CI 已实现，本地模拟 /res 全场景验证通过，待生产落盘（2026-10-28）→ 详见 docs/requirements-log.md#r15
R16. 页面规则持久化 + WebDAV 同步、更新检查移到设置页并自动化、公共后缀表更新 — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-11-05）→ 详见 docs/requirements-log.md#r16
R17. 后台按 tabId 的调用兜住「标签已关闭」竞态 — 状态：已实现，构建通过，待实机确认（2026-11-09）→ 详见 docs/requirements-log.md#r17
R18. popup 收敛为「一址一规则」：模式即路由，去掉作用域与撤销按钮 — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-11-09）→ 详见 docs/requirements-log.md#r18
R19. 页面规则与情景模式改名 / 删除不一致 — 状态：已修复（2026-11-09）→ 详见 docs/requirements-log.md#r19
R20. 切换不改变实际路由时不再刷新页面；本页写入改为显式意图 — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-11-11）→ 详见 docs/requirements-log.md#r20
R21. 仓库根 `favicon.svg`（供 OpenChamber 等项目列表识别图标） — 状态：已完成并提交（2026-11-12）→ 详见 docs/requirements-log.md#r21
R22. 页面规则多设备感知提速（条件轮询 + 事件补拉） — 状态：构建与逻辑校验通过，待实机确认（2026-11-13）→ 详见 docs/requirements-log.md#r22
R23. WebDAV 备份保留最近 3 个版本（含一次「备份变默认配置」事故复盘） — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-11-15）→ 详见 docs/requirements-log.md#r23
R24. WebDAV 首次连接只读不上传（默认配置不再覆盖服务器备份） — 状态：构建通过，真实 Chromium 端到端校验通过，待实机确认（2026-11-15）→ 详见 docs/requirements-log.md#r24
R25. popup 去掉「全局 / 本页」切换：一址一「当前」规则 + 选项里的「默认」 — 状态：构建与浏览器校验通过，待实机确认（2026-11-17）→ 详见 docs/requirements-log.md#r25
R26. 页面规则自动清理与默认情景模式相同的冗余项 — 状态：构建与单测通过，待实机确认（2026-11-17）→ 详见 docs/requirements-log.md#r26
R27. popup「作用范围」开关（本页 / 整域通配符）+ 绑定子域添加即绑定 + 样式重做 — 状态：构建与浏览器校验通过，待实机确认（2026-11-17）→ 详见 docs/requirements-log.md#r27
R28. GitHub Actions 发版（GitHub + Gitee 双 Release）+ 更新检查改读 Releases API（Gitee 优先、GitHub 降级） — 状态：已发版 v3.7.3，待实机确认（2026-11-18）→ 详见 docs/requirements-log.md#r28
R29. popup 作用范围 / 绑定 chip 改为按 host 存 — 状态：构建通过，待实机确认（2026-11-19）→ 详见 docs/requirements-log.md#r29
R30. 设置页「关于」的「重载扩展」不再关闭设置窗口 — 状态：构建通过，待实机确认（2026-11-19）→ 详见 docs/requirements-log.md#r30

## 4. 项目基础架构

### 4.1 模块（monorepo，无 git submodule）

| 模块 | 职责 |
|---|---|
| `omega-pac/` | 浏览器无关的代理模型与 **PAC 生成**（Profiles / Conditions / RuleList / PAC 编译；依赖 tldjs、uglify-js、ip-address） |
| `omega-target/` | 浏览器无关的 **Options 管理器**（profile 应用、临时规则、状态），被各 target 继承 |
| `omega-web/` | Web 配置界面：options 页（AngularJS）、两套 popup、temp_rules 管理器、network 监测页；样式 Less / 模板 Jade |
| `omega-target-chromium-extension/` | Chromium / Firefox 扩展 target：MV3 service worker（`overlay/x-background.js`）、background、proxy 实现、webRequest 监控、manifest（`overlay/`） |
| `omega-locales/` | 翻译（Weblate 托管，`*.po`） |
| `omega-build/` | 构建编排：`npm run deps / dev / build / release`（grunt hub） |

### 4.2 技术栈

- 主体逻辑：**CoffeeScript 1.x**（经 Browserify / coffeeify 打包）。
- UI：AngularJS 1.x（options 页与“添加条件 / 请求信息”表单）+ **原生 JS / jQuery**（新版 popup 及 network、temp_rules 页面）+ Bootstrap 3 风格 + Jade / Less。
- 扩展平台：**Manifest V3**（service worker；`minimum_chrome_version: 88`），同时兼容 Firefox。
- 构建：Grunt 0.4.x + Bower（omega-web 前端依赖）；**Node ≥ 20**（发布流水线用 Node 22）；`.circleci` 配置已过时（Node 7.10），不要依赖它。

### 4.3 构建与测试

```bash
# 一次性
cd omega-build
npm run deps     # 各模块 npm install（omega-web 会 bower install）
npm run dev      # npm link 本地模块（部分环境需要 sudo）
npm run build    # 产出 omega-target-chromium-extension/build（可加载的未打包扩展）
npm run release  # 产出 dist/ 下的 chromium / firefox 压缩包

# 测试
cd omega-pac && npm test      # 注意脚本内联 TZ=Europe/London，Windows 下需用 Git Bash/WSL 或手动设环境变量
cd omega-target && npm test
```

- 各模块**当前没有 lockfile**；依赖安装结果不完全可复现（见档案 R3）。
- 各模块 `grunt` 的 `default` 含 `coffeelint`。改完至少跑对应模块的 `grunt`（或 `npm run build`）以及 `omega-pac` / `omega-target` 测试。`omega-pac` 有 1 个既有失败（`Profiles #pacResult` SOCKS5），不要当成新回归；历史计数见档案。
- **行尾要求（硬性）**：仓库根 `.gitattributes` 固定 `*.coffee text eol=lf`。不要删该文件，也不要把 coffee 工作区改回 CRLF（CRLF 会让 coffeelint 误报超长行、`grunt` 失败）。
- **文案目录缓存（硬性）**：`build/_locales/*/messages.json` 在扩展加载时一次性读入内存；改 `omega-locales` 后必须重载扩展。popup 的 HTML/CSS/JS 每次打开重读，会出现「新界面 + 空文案」，勿误判为渲染 bug。

### 4.4 关键运行机制

- **Profile 模型**：`omega-pac` 把 profile 编译为 PAC 脚本或固定配置，target 侧 `proxyImpl` 应用到浏览器。
- **临时规则（页面规则）**：`_tempProfile`（SwitchProfile）在 PAC 第一层，层级深者在前、首条命中。持久化在 `state.tempRules`（重启仍在），于 `options.ready` 内恢复；3.6.4 及之前的 session 规则首次启动迁移。
  `getPageInfo()` 提供 `domain` / `host` / `subdomain` / `tempRuleProfileName`（主域）/ `tempRuleHostProfileName`（子域）/ `tempRuleMatch`（系统代理为全局时为 null）。主域用 `omega-pac/src/public_suffix_rules.json`，不用 tldjs 自带旧表。
  popup、请求信息详情、网络监测页、临时规则管理器都走 `addTempRule`。`2` = force set（同则不删），`-1` = force delete（不看传入名字）。
- **页面规则同步**：开启 WebDAV 且「同步页面规则」（默认开）时，规则在 `zeroomega/zeroomega-temprules.json`，不进 options 整包备份。
  变更后 1s 防抖：拉取 → 与 `state.tempRulesBase` 按站点三方合并（同一站点两边都改则本机这次优先）→ `If-Match` 上传，412 重试。
  启动时拉一次；每 30 秒 `omega.tempRulesPullV2`（`If-None-Match`，304 零传输）；popup 打开与窗口聚焦补拉（30 秒内已同步则跳过）。失败按 30 秒起到 5 分钟退避；本地改动、保存设置、手动同步可穿透。
  另有 24h 闹钟 `omega.tempRulesCleanup`（启动时也跑一次）删除 profileName 等于当前默认情景模式的冗余规则，走同一条同步链路；非默认规则一律保留。
- **整体 options 备份**：`zeroomega/zeroomega-<commitId>.json` + `zeroomega-commit.txt`，保留最近 3 份；无 mtime 或列目录失败则不删。凭据只存本地，不用 Gist。
  首次连接已有备份的服务器只读：记 `adoptPending`、暂停自动备份，由用户选恢复或立即备份；空服务器则首次上传记 `syncedUri`。之后自动备份 2s 防抖。
  探测失败不加离线闸门。恢复到缺少 profile 的 options 仍会清掉引用它的页面规则（未做保护）。两份文件互不影响。
- **popup**：无「全局 / 本页」、无顶部站点卡。每个完整 hostname 一条持久「当前」规则；新域名按实际命中规则、否则「默认情景模式」播种（force set、不刷新）。
  点任意行（含已勾选）写规则并 `refreshAlways` 强制刷新。列表下方有「作用范围」开关（关 = 当前 host，开 = 主域 key → `*.domain`；整域时同时写 host 与 domain 两条同 profile 规则以消除遮蔽），按主域持久化到 `localStorage`；输入框绑定同域子域「添加即生效」并生成 chip（× 即删规则）。系统代理 / 外部 PAC 时只显示说明。
  「请求信息」表单仍走 Angular `popup.html`。`.om-nav` 与 `js-*` id 是键盘导航根，行结构保持 `.om-nav-item > a`。
- **其它刷新**：popup 点情景行以外，只在活动页实际代理结果变化时刷新；任一侧未知，或 URL 与活动 tab 不一致，则保守刷新。
- **更新检查**：background 读 GitHub / Gitee 的 Releases API（Gitee 主通道 → GitHub API 复核/降级 → Releases 页面兜底）；启动时距上次超过 30 分钟，以及每 6 小时各查一次。Gitee 说"已是最新"时用 3 秒短超时向 GitHub 复核，探测失败维持原结论；附件缺失报明确错误、不当成"无新版"。每个版本只通知一次，点击打开设置页「关于」（显示来源 / 复制命令 / 重载扩展 / 立即检查）。未打包扩展不能改写自身文件，不做静默自更新。popup 无更新入口。
- **发版与分发**：GitHub Actions（`.github/workflows/release.yml`）在 `v*` tag 上构建，校验「tag == 仓库 manifest == 包内 manifest」与 CHANGELOG 段落，产出 `chromium-release.zip` / `firefox-release.zip` + sha256，发布到 GitHub Release，并同步同一 Release（含 4 个附件）到 Gitee 镜像 `huaxudong/ZeroOmega`（`GITEE_TOKEN` Secret，失败只标 `::error::` 不阻断）。另有 `sync-gitee.yml` 在 `custom_main` / `master` 推送时同步源码分支。原 Woodpecker 内网分发已停用（`.woodpecker.yml` 删除），`tools/ci/` 下三个脚本为历史遗留。
- **请求监控**（默认关闭）：`webRequest` 统计每标签失败请求，popup 顶部「N 资源未加载」；详情模式可按 host 加条件或临时条件。

## 5. 决策日志（Decision Log）

> 只留当前仍约束行为的决策，每条一行。原文，以及已被取代的 D6、D7、D9、D10、D11、D15、D16、D17、D18、D22 等，在 `docs/requirements-log.md`。

| # | 决策 | 备选方案 | 理由 |
|---|---|---|---|
| D1 | 临时规则按域名层级排列，更深的 host 在前，首条命中。不做 URL / 路径级 | 路径条件 / 多级上溯菜单 | 与 PAC 首条命中一致。popup 的子域/主域切换已取消（D28） |
| D2 | 不做框架与构建链大改造，只做针对性加固 | 迁移 Vite / 重写 UI | 现有链可用，大改造风险高、收益低 |
| D3 | 不主动与上游同步，不向上游提 PR | 定期合并上游 | 华总明确要求；仅其明确指令时才同步 |
| D4 | 动手前先确认需求是否已经满足 | — | 避免重复实现 |
| D5 | 不做按标签页（per-tab）路由 | 本地代理 | `chrome.proxy` 是浏览器级配置，无法按标签页 |
| D8 | 条件类型固定为高级列表；快速切换端到端移除；不导出旧版规则列表 | 只藏 UI | 自用场景不需要；留下入口会把死代码带回来 |
| D12 | 交互态用主色，不用灰的 `--selectionBackground` 做选区、聚焦环、按钮描边；不改 base16 语义别名 | 改回 Tomorrow | 灰是观感问题的原因；改别名会波及其它主题 |
| D13 | 内置主题为 `ios` / `morandi` / `claude` × 浅色 / 深色 / 跟随系统，两处 UI 共用主题变量。不删除 `themes.json` 的 others，已带 `--om-theme` 的快照不要重写 | 只留一套主题 | popup 的胶囊与「切作用域搬规则」已作废，见 D28 |
| D14 | 一次点击只写当前 host 这一条规则，不隐式改写或删除其它 key | 切模式时清掉别的站点 | 临时规则在 PAC 第一层，删错会让其它站点失效 |
| D18 | 版本端点是静态 `version.json` + `version.txt`；版本只读 zip 内 manifest；无 `--version`；同版本沿用 `updated_at`；sha 不一致仍写实算值并退出码 2；URL 相对 | 复用分发包清单 / 写绝对 URL | 清单随首页展示漂移；绝对 URL 换域名即失效。字段见第 4.4 节 |
| D19 | 页面规则持久化在扩展状态区；WebDAV 用独立小文件，先拉、按站点三方合并、再推 | 只放 session / 塞进整包备份 | 重启后规则还要在；整包互相覆盖会丢其它站点 |
| D20 | 更新检查在 background（启动与每 6 小时），每版本通知一次；UI 在设置页「关于」。主域用仓库内置 PSL 全表 | popup 常驻 / 升级 tldjs | 更新是低频事。旧表会把 `*.cc.cd` 算成同一主域 |
| D21 | service worker 里按 tabId 的调用用回调并读 `chrome.runtime.lastError`，标签已关则跳过 | 不接住的 Promise | 未处理的 rejection 会进扩展「错误」面板 |
| D23 | `addTempRule` 的 `2` 为 force set、`-1` 为 force delete。非 popup 路径只在实际代理结果变化时刷新 | 每次 reload / 用 toggle | toggle 遇上过期的本地视图会把设置做成删除。popup 点击见 D28 |
| D24 | 仓库根保留 `favicon.svg`（品牌蓝圆角方块 + 白色 omega），不参与扩展打包 | 裸标透明底 | 项目列表只认 `favicon.*`。改 `omega-web/img/icons/` 时同步这里 |
| D25 | 多设备页面规则用 30 秒条件轮询加 popup 打开 / 窗口聚焦补拉，不引入推送。闹钟名为 `omega.tempRulesPullV2` | 10 分钟全量轮询 / WebSocket | dufs 没有变更通知；304 一轮几乎不耗流量 |
| D26 | 选项备份保留最近 3 份；没有 mtime 的文件不删，列目录失败则整轮不删。恢复可选历史版本，id 走白名单 | 上传后删掉旧文件 | 单槽曾把唯一一份好备份删掉。不做服务端锁 |
| D27 | 首次连上已有备份的服务器只读不写，等用户选「从备份恢复」或「立即备份」；空服务器首次上传即基线 | 自动拉取或自动推送 | 两个方向的自动覆盖都会毁掉另一边的好配置 |
| D28 | popup 没有模式：每站点一条「当前」规则；「默认情景模式」只给新域名做种子。点任意行（含已勾选）= force set + 强制刷新。系统代理 / 外部 PAC 时只显示说明 | 保留全局/本页胶囊 | 模式与规则分离会让高亮和真实路由不一致，点已选项也会像没反应 |
| D29 | 只清理 profileName 等于当前默认情景模式的页面规则（24h 闹钟 + 启动时），走既有 WebDAV 同步；非默认规则保留 | 按「30 天未访问」清理 / 只手动清 | 与默认相同的规则删掉后路由与勾选都不变，零可见影响；时间戳方案需新状态且有「还在用却被清」的风险 |
| D30 | popup 作用范围做成 iOS 风格开关：关 = 当前 host，开 = 主域 key（`*.domain`，同时写 host 与 domain 两条同 profile 规则）；绑定子域添加即生效 + chip × 即删规则；卡片放列表下方、描述极简 | 同域联动列表 / 只有整域 / 选项页配组 | 整域通配符更简单，开关比文字按钮符合习惯，添加即绑定少一次点击；整域同时写 host 消除遮蔽导致的勾选不跟随 |
| D31 | 开发、提交、发版 tag 全在 `custom_main`；`master` 只作上游基线（v3.5.2），不在其上提交或打 tag | 发版切 master 打 tag / 双分支并行开发 | 单一工作分支让历史与 tag 对得上；master 保持与上游一致，便于将来按需比对 |
| D32 | 发版统一走 GitHub Actions，同时投递 GitHub Release 与 Gitee 镜像 Release（`huaxudong/ZeroOmega`，4 个附件）；停用 Woodpecker 内网分发 | 保留 Woodpecker / 只发 GitHub | 开源项目以 GitHub 为主；Gitee 供国内高速下载；镜像失败 continue-on-error 不阻断 GitHub 发版。tag、仓库 manifest、包内 manifest 三处版本必须一致，分叉即失败 |
| D33 | 更新检查读 Releases API：Gitee 主通道 → GitHub API（复核/降级）→ Releases 页面兜底；只放行官方域名与 `.zip` 资产；按浏览器选 chromium / firefox 包 | 只读单一静态 version.json / 信任响应里的任意下载 URL | Gitee 镜像会落后，短超时复核可自愈；附件缺失必须报错而非"无新版"；远端 URL 是安全边界，不能让伪造响应把命令指向任意程序 |
| D34 | 更新检查保留 background 定时（启动 + 每 6h）+ 每版本一次通知 + 设置页「关于」UI；未打包扩展仍用复制命令 + 重载，不静默自更新 | 改用自动下载安装 / 把入口放回 popup | 扩展无法改写自身文件；更新是低频事，popup 空间宝贵 |
| D35 | popup「作用范围」开关与绑定 chip 的偏好按 **host** 存（`omega.popup.linkGroup:<host>`），不再按主域；路由规则仍只按目标 host 存一份 | 继续按主域存 / 按「发起页 + 目标 host」存 | 按主域会让兄弟子域共享开关与 chip，与「本页」文案矛盾且从一处删除波及另一页；按页对存需要 per-tab 路由（D5，Chrome 做不到） |
| D36 | 「重载扩展」走后台：重载前记下设置页 tab/window，新后台启动后恢复该标签（还在则刷新、已关则用原窗口重建，窗口失效则回退新窗口） | 页面直接 `chrome.runtime.reload()` / 让用户去 `chrome://extensions` 手动重载 | 直接重载会卸载扩展所有页面、设置窗口消失；经后台记录可在重载后把设置页带回来 |
