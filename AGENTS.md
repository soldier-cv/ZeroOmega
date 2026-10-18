# ZeroOmega 私有 Fork — Agent 工作规约（AGENTS.md）

> 适用于任何在本仓库工作的 agent（含 AI 与人类协作者）。**开工前先读第 1 节。**

## 0. 项目定位与 fork 策略（硬性）

- 本仓库 `soldier-cv/ZeroOmega` 是 [zero-peak/ZeroOmega](https://github.com/zero-peak/ZeroOmega) 的**个人 fork**，自用定制。上游是 SwitchyOmega 的 Manifest V3 继任者。
- fork 基线：**v3.5.2**（commit `c367db2`，2026-09-09），fork 创建于 2026-10-16。
- **不主动与上游同步（硬性约定）**：
  - 不自动合并 / 跟随上游改动；不向上游提交 PR、issue 或任何回馈；
  - 仅当华总明确下达“同步上游 / 合并上游”指令时才执行，执行前先确认范围与冲突处理方式；
  - 讨论、设计与实现均以本仓库自身为准，不得以“上游是这么做的”为由改动代码或推翻既有决策。

## 1. 任务开始前的第一件事（硬性）

**先确认“需求是否已经被满足 / 已经可用”，再决定是否动手。** 具体：

1. 对照第 3 节“需求台账”与代码现状，给出明确结论之一：
   - **已满足** → 报告现状与用法，不要重复实现；
   - **部分满足** → 先说明现有入口 / workaround 与差距，再谈实现；
   - **未满足** → 进入设计与实现流程。
2. 必要时先查 ai-memory（`memory_query`）与 git 历史，避免重复劳动。
3. 需求或状态有变化时，必须回填需求台账（第 3 节）与决策日志（第 5 节），并把关键结论同步到 ai-memory。

## 2. 通用规矩

1. 动手前先读相关模块的现有代码；保持与周围代码一致的结构与风格（CoffeeScript / 原生 JS / Jade / Less 并存，见第 4 节）。
2. 改动小而聚焦；**不做顺手的大重构、不更换技术栈、不做“追新”式依赖升级**（见决策 D2）。
3. 不新增运行时依赖，除非确有必要并在提交/说明中给出理由（扩展对包体积敏感）。
4. 面向用户的文案按现有 i18n 流程补充（`omega-locales`，以 `en_US` 为源）；本 fork **同步维护 `zh_CN`**（华总界面语言，避免依赖 Weblate 回流）；其它语言由 Weblate 托管，**不要手改**。
5. 改动需考虑 Chrome 与 Firefox 两个 target 的差异（代码用 `globalThis.localStorage` 等特征分支区分，参见 `omega-target-chromium-extension/overlay/x-background.js`）。
6. Git 提交信息**必须使用中文**，推荐 Conventional Commits 前缀 + 中文简述，如 `feat: 支持当前子域级临时路由`。
7. **发布（发版）仅在华总明确指令时执行**：版本号递增 → CHANGELOG → 打 tag → 推送远端触发流水线；不得自作主张发布。
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

## 3. 需求台账（Requirements Ledger）

> 新需求一律追加到本节；写清：背景 / 已确认决策 / 现状与 workaround / 已知缺陷 / 相关代码 / 状态。

### R1. 当前子域级临时路由（Temp Rule） — 状态：**已验证**（2026-10-16；单元测试 + 实机验证通过）

- **背景**：维护者日常在 `postest.findfine.com` 这类开发子域上调试；auto switch 提供的是**主域级固定路由**，而 popup 里的**临时规则**（漏斗入口）只能按主域（`findfine.com`）设置，无法“只对当前子域临时生效、不影响主域与其它子域”。
- **真实使用场景（2026-10-16 补充）**：一个主域名对应多个环境子域名；auto switch 已按环境配置：**开发子域 → FIDDLER、测试子域 → 直连、生产子域 → 代理**。痛点：偶尔需要把**开发子域临时改走直连**（去连对应服务器上的开发环境），但切换全局 profile 会把**所有标签**一起切走，导致其它标签上的生产环境失效；改 auto switch 规则又是永久改动、来回改太烦。→ 需要“只对该子域生效、不影响其它标签 / 环境”的临时覆盖。
- **已确认决策**：作用域 = **当前子域为准**（规则形如 `postest.findfine.com`，含其更深层子域）。
- **语义保障（实现前提）**：临时规则位于外层 `_tempProfile`（SwitchProfile），先于 base profile（auto switch）匹配 → 临时规则天然**优先于** auto switch 的固定规则；但**子域规则必须先于主域规则**（依赖规则顺序修复，见“已知缺陷”①）。
- **非目标**（本次不做）：URL / 路径级（`*://host/path/*`）、多级上溯选择、仅当前标签页（per-tab）覆盖——Chrome 代理设置是浏览器级全局配置（不按标签页），per-tab 需本地代理等重型方案；本场景用“当前子域”覆盖即可等价满足（见 D5）。
- **实现（2026-10-16）**：
  - `omega-target/src/options.coffee`：`addTempRule()` 改为按域名层级插入（`_insertTempRule`，层级深者在前）——修复“首条命中遮蔽”；`queryTempRule()` 保持**精确 key** 查询（key = 主域或完整 host）；
  - `omega-target-chromium-extension/src/module/options.coffee`：`getPageInfo()` 新增 `host`（完整主机名）与 `tempRuleHostProfileName`（子域级规则）；原 `tempRuleProfileName`（主域级规则）语义不变；
  - `omega-web/src/popup/js/profiles.js`：漏斗下拉新增**作用域选择**（默认“当前子域”，可切“整个主域”；`host == 主域` 时隐藏切换行），按所选作用域显示高亮 / 新增 / 撤销；
  - i18n：新增 `popup_tempRuleScopeSubdomain` / `popup_tempRuleScopeDomain`（`en_US` + `zh_CN`，见 §2.4）；
  - 测试：`omega-target/test/temp_rules.coffee` 新增 6 例（插入顺序 / 匹配最具体规则 / 精确查询 / 二次点击撤销）。
- **其他入口（保持可用，同样受益）**：① “N 资源未加载” → 详情模式 → “Add temp condition”；② 网络监测页规则编辑器（带“子域层级”切换按钮）——两者都走同一 `addTempRule`/顺序逻辑。
- **原缺陷（均已在本次修复）**：① 子域规则被主域规则静默遮蔽；② 子域规则无法在漏斗高亮 / 撤销。
- **实机验证（2026-10-16）**：重载扩展后，子域规则的设置 / 高亮 / 撤销与实机路由行为正常。
- **相关代码**：
  - 核心：`omega-target/src/options.coffee`（`getTempRules` / `addTempRule` / `queryTempRule` / session 恢复）
  - 扩展侧：`omega-target-chromium-extension/src/module/options.coffee`（`getPageInfo`，`chrome.storage.session` 持久化）
  - 新 popup：`omega-web/src/popup/js/profiles.js`（漏斗下拉 `createTempRuleDropdown`）+ `omega-web/src/popup/js/index.js`
  - Angular 表单版：`omega-web/src/coffee/popup.coffee` + `omega-web/src/popup.jade`
  - 管理器：`omega-web/src/popup/temp_rules/`
  - 匹配语义：`omega-pac/src/conditions.coffee`（`HostWildcardCondition`）——`*.x.y` 匹配 `x.y` 本身及其任意深度子域；裸 host 精确匹配

### R4. popup 菜单重构美化 + 本页路由表达 — 状态：**已验证**（2026-10-16；本地预览逐场景核验 + 实机确认）

- **背景**：R1 实机查看 popup 时华总提出两点：① 临时规则生效时主列表仍高亮 `auto switch`，与下拉里高亮的 `[直接连接]`（临时规则目标）形成“双重高亮”，用户困惑“究竟走的什么路由”；② 下拉内部的作用域选择（子域/主域）样式与列表项混同、域名被截断（如 `postest.findfine.c…`），看不出可点。要求“整个菜单做个美化重构”。
- **已确认决策**：菜单分区化——「本页路由」卡片 + 「全局情景模式」列表，两个概念在视觉上彻底分开；本页卡片直接回答“本页走什么”：显示当前命中的临时规则（profile chip），未设置/不可用时给出明确文案与说明 tooltip；作用域选择改为**分段控件**（本子域 / 整个主域）+ “作用于 `<host>`”全文展示（不截断）；全局列表当前项加「当前」标签。**仅重构表达，不改路由语义**（D1/D5 不变：临时规则优先于 base、子域规则优先于主域规则）。
- **实现（2026-10-16）**：
  - `omega-web/src/popup/index.html`：骨架重写——独立隐藏模板 `#js-profile-tpl`（克隆后移除 `om-hidden`，修复原“模板即直连行”的重复 id 隐患）、本页路由卡片（host + 临时规则行）、全局情景模式卡片（直连/系统/自定义/添加条件）、资源未加载警告条置顶；
  - `omega-web/src/popup/js/profiles.js`：新增 `renderPageSection` / `updateTempRuleRow` / `createProfileChip` / `addCurrentChip` / `tempRuleForPage`；`createTempRuleDropdown` 重做（`om-segmented` 分段控件 + `om-scope-hint` 作用于行 + “应用情景模式”列表 + 「撤销该作用域的临时规则」行，撤销走 `addTempRule(key, name, -1)`）；取消 `createGlobeIcon`（内置直连/系统行与自定义行统一为单图标着色）；
  - `omega-web/src/popup/js/index.js`：`addTempRule(domain, profileName, toggle)` 透传 toggle（-1 = 强制删除，与 temp_rules 管理器、network 页调用约定一致）；
  - `omega-web/src/popup/js/i18n.js`：补分区标题与临时规则标签；
  - `omega-web/src/popup/css/index.css`：整体重写（系统字体栈；白色圆角卡片 + 灰色分区标题；hover/focus 环；chip；分段控件；下拉内嵌面板；琥珀色警告条）；
  - 实机修订：`updateOtherItems` 隐藏「添加条件」行时同步隐藏其后分隔线（消除卡片底部的悬空线）。
  - i18n（`en_US` + `zh_CN` 同步）：新增 `popup_sectionPage` / `popup_sectionProfiles` / `popup_tempRuleLabel` / `popup_tempRuleNone` / `popup_tempRuleUnavailable` / `popup_tempRuleUnavailableHelp` / `popup_tempRuleHelp` / `popup_tempRuleScope` / `popup_tempRuleAppliesTo`（`$DOMAIN$`）/ `popup_tempRuleApplyProfile` / `popup_tempRuleRemove` / `popup_current`；改义 `popup_tempRuleScopeSubdomain` / `popup_tempRuleScopeDomain` 为短标签（完整域名移到“作用于”行）。
- **验证方式**：本地临时静态预览（本机临时目录下的 harness：模拟 `chrome.*` / `OmegaTargetPopup`，直接读取源文件，不入库）逐场景截图核对：有子域规则（高亮 chip + 撤销行）/ 无规则 / 仅主域规则 / 单层域名（无分段控件）/ 全局不支持临时规则（不可用）/ 资源未加载警告 / 键盘帮助徽标；`npm run build` 通过，构建产物与源文件逐字节一致。
- **实机确认（2026-10-16）**：重载扩展后确认界面分区、临时规则表达、作用域选择与应用 / 撤销链路符合预期。
- **注意（后续改动约束）**：popup 的 `js-*` id 与 `.om-nav` 根节点是键盘导航（`keyboard.js` TreeWalker 按 tab 序行走）与 `keyboard_help.js` 帮助徽标的依赖；菜单行结构请保持“`.om-nav-item > a`（flex：图标 + 名称 + 附属元素）”。

### R5. popup「本页覆盖」互斥开关 + 两列表一致性 — 状态：**已被 R9 取代**（2026-10-16）

- **背景**：R4 实机后华总反馈两点：① 临时规则与全局当前并列展示形成“双重状态”（本页临时 `[直接连接]` + 全局当前 `VPN`），期望两者**互斥**——“如果我手动点击了某个全局，这个临时应该要变成全局或 无”；② 临时下拉的「应用情景模式」列表与「全局情景模式」列表**内容与顺序不一致**（缺 `[系统代理]`、隐藏当前全局、排序不同），问“是否可以做成开关之类的”。
- **已确认决策（D7）**：本页路由改为**互斥开关模型**——页卡片新增「本页覆盖全局」开关（iOS 风格）。OFF = 跟随全局（行显示“跟随全局 · [全局 profile]”，灰显）；ON = 本页使用独立情景模式（临时规则）。**点击任意全局情景模式行 = 应用该全局 profile + 清除本页临时规则**（host 规则与主域规则），即“本页回到跟随全局”。
- **实现（2026-10-16）**：
  - `omega-web/src/popup/index.html`：页卡片新增开关行 `#js-override-switch`（`role="switch"` + `aria-checked`）；
  - `omega-web/src/popup/js/profiles.js`：`updateTempRuleRow` 重写（开关状态 = 是否存在生效临时规则；OFF 行显示“跟随全局” + 灰色 chip，`globalProfileForPage` 取当前全局）；新增 `pageTempRules` / `clearPageTempRules`（清 host + 主域规则 → 就地刷新 UI + 重建下拉）/ `resetTempRuleDropdown` / `bindOverrideSwitch`；下拉列表重做 `buildEntries`——顺序与全局列表**完全一致**（直接连接 → 系统代理（**禁用行**，右侧「仅全局」标注 + 说明 tooltip）→ 自定义 profile 同 `compareProfile` 排序；不再隐藏当前全局）；
  - `omega-web/src/popup/js/index.js`：新增 `applyGlobalProfile`（先清本页临时规则再应用全局；direct / system / 自定义行统一走它）与 `clearTempRule`（不关 popup 的删除调用）；
  - `omega-web/src/popup/css/index.css`：`.om-switch`（40×24 iOS 风格开关，绿 #34c759）、`.om-override-row`、`.om-chip-muted`、`.om-temprule-follow`、`.om-item-note`、通用 `a.om-disabled`；
  - i18n（`en_US` + `zh_CN` 同步）：新增 `popup_pageOverride` / `popup_pageProfileLabel` / `popup_pageFollowGlobal` / `popup_pageOverrideHelp` / `popup_tempRuleSystemGlobalOnly` / `popup_tempRuleSystemGlobalOnlyHelp`；`popup_tempRuleLabel`（“临时规则”）不再使用（条目保留）。
- **语义说明**：开关关闭 = 本页不再被覆盖，因此同时清除 host 与主域两条临时规则；仅当对应规则确实存在时才发删除调用（`addTempRule(key, 现有 profileName, -1)`，避免 `byName(null)` 被拒）。
- **验证方式（本地预览 harness）**：开关 ON/OFF 就地切换（调用日志确认 `addTempRule(postest.findfine.com, direct, -1)`）；点全局行 → `addTempRule(..., -1)` + `applyProfile(FIDDLER)`；下拉列表与全局列表顺序一致；系统代理禁用行（「仅全局」）；主域规则场景（`整个主域` 作用域下 ✓ + 撤销行）；单层域名（无作用域分段控件）；系统代理为 base（开关隐藏 + “不可用”）；`npm run build` 通过、产物与源逐字节一致。
- **被 R9 取代（2026-10-16）**：实机后华总认为「本页覆盖全局」文案绕、两套列表重复。交互改为顶部「全局 / 当前」分段按钮 + 一套列表，见 R9。本条保留作决策记录，不再按此实现。

### R9. popup 简化为「全局 / 当前」一个按钮 + 一套列表 — 状态：**已被 R10 取代**（2026-10-16；实现记录保留）

- **背景**：R5 实机截图（`1panel.codec.top`）里同时出现「本页覆盖全局」开关、「情景模式」行、「作用域」分段、「应用情景模式」列表和「全局情景模式」列表。华总要求收成一个按钮：模式 = 全局 / 当前，点一下切换；切到全局隐藏作用域，切到当前隐藏“全局”这一套重复列表。
- **已确认决策（D11）**：
  - 顶部一行：站点名 + 「全局 / 当前」分段按钮。下面始终只有一套情景模式列表。
  - 分段按钮的语义 = 「本页跟随谁」的开关，不是单纯的列表过滤器：切到**全局** = 本页跟随全局（**同时清除本页临时规则 host + 主域**）；切到**当前**不改动已有规则，只改变下一次点选的含义。
  - **全局**：点选即应用该全局 profile；高亮 = 当前全局。
  - **当前**：点选把该 profile 写成所选作用域的临时规则（再点同一项即撤销，沿用 `addTempRule` 的 toggle 语义）；高亮 = 该作用域已有的临时规则（浅蓝底 + 勾，不再铺蓝底，以免和全局当前混淆）。
  - 作用域（本子域 / 整个主域）**只在「当前」且站点是子域时**出现，默认本子域；单层域名没有这一行。
  - 系统代理在「当前」下禁用并标注「仅全局」（PAC 不能包含系统代理，与 R2 一致）。
  - 打开 popup 时，本页已有临时规则则落在「当前」，否则落在「全局」。
  - 全局 profile 不支持临时规则（如系统代理为 base）时，「当前」按钮禁用。
- **实现（2026-10-16）**：
  - `omega-web/src/popup/index.html`：删掉开关行、情景模式行和第二套分区标题；页卡片只留站点名 + `#js-mode-global` / `#js-mode-page` + `#js-scope`。
  - `omega-web/src/popup/js/profiles.js`：`setMode` / `applyMode` / `refreshActive` 按模式重画同一套列表的高亮与禁用态；`applyPageProfile` 写临时规则；`renderScope` 只在子域场景渲染作用域分段。
  - `omega-web/src/popup/js/index.js`：`chooseProfile` 按 `OmegaPopup.mode` 分发到 `applyGlobalProfile` 或 `applyPageProfile`；系统代理在「当前」下直接忽略。
  - 键盘：`T` 在「全局 / 当前」之间切换（`keyboard.js` / `keyboard_help.js`）。
  - i18n（`en_US` + `zh_CN`）：新增 `popup_modeGlobal`（全局 / Global）、`popup_modePage`（当前 / This page）、`popup_modeHelp`；删 `popup_pageOverride` / `popup_pageProfileLabel` / `popup_pageFollowGlobal` / `popup_pageOverrideHelp`。
- **插件名**：`overlay/manifest.json` 与 `manifest-firefox.json` 的 `name` 由硬编码 `Proxy SwitchyOmega 3 (ZeroOmega)` 改为 `__MSG_manifest_app_name__`（en / zh 均为 ZeroOmega）。
- **验证方式（2026-10-17）**：
  - 构建 / 测试：`npm run build` 全绿（coffeelint 全过）；omega-target 6 passing / 0 failing；omega-pac 142 passing / 1 failing（既有 SOCKS5，与本次无关）。构建产物与源文件逐字节一致；`build/manifest.json` / `manifest-firefox.json` 的 `name` = `__MSG_manifest_app_name__`，`build/_locales` 含 `popup_modeGlobal` / `popup_modePage` / `manifest_app_name`。
  - 界面：本地静态预览（临时目录，不入库；直接以构建产物供服务）逐场景截图 6 张——全局无规则 / 当前 + 子域作用域 / 仅主域规则（作用域自动对齐「整个主域」）/ 单层域名无作用域 / 系统代理「当前」禁用 +「仅全局」/ 资源未加载警告。
  - 交互（预览页用桩驱动点击、读回调用序列）：当前模式点 profile → `addTempRule(host, name)`（再点同项 = 撤销）；全局模式点 profile → `applyProfile(name)`；切到「全局」→ 先 `addTempRule(key, name, -1)` 清本页规则、再应用全局；系统代理为 base 时「当前」按钮点不动（保持全局）；单层域名写入的 host 规则即主域规则。
- **待实机**：重载扩展确认界面与文案（本地已逐张核验；`_locales` 需重载扩展才生效）。
- **被 R10 取代（2026-10-18）**：实机后华总要求把「全局 / 当前」两个并排分段按钮收成**一个状态胶囊**（只显示当前态、点击切换），并去掉「仅全局」旁注；子域与主域改为共用一条路由。见 R10。

### R10. popup 交互收敛 + 三套内置主题（iOS / 莫兰迪绿 / Claude Code） — 状态：**构建与本地预览已核验，待实机确认**（2026-10-18）

- **背景**：R9 实机后华总提出四点：①「全局 / 当前」不该是两个并排的分段按钮，应是一个按钮、显示当前状态、点一下就切换；②「仅全局」这类旁注没有意义，选「当前」时不该再和全局纠缠（包括系统代理行）；③子域与主域必须**共用同一条路由**，切换作用域不应要求再选一次 profile；④选子域要显示完整主机名（`cn.bing.com`），选主域只显示主域名（`bing.com`）。主题方面：现有蓝色刺眼、配色不协调，要求三套主题（iOS / 莫兰迪绿 / Claude Code）各含浅色 / 深色 / 跟随系统，并且**主题同时作用于设置页与 popup**。
- **已确认决策（D13）**：
  - 顶部页卡片 = 「图标 + 站点名 + 一个模式胶囊（`全局` / `本页`）+ 副标题说明当前实际路由」；胶囊只显示当前状态，点击切换。
  - 切到「全局」**清除本页临时规则**（host + 主域），保证高亮行与实际路由永远一致；切到「本页」不改动已有规则，只改变下一次点选的含义。
  - 列表始终只有一套，标题随模式变化：`全局情景模式` / `<作用域域名> 的情景模式`。
  - **本页模式隐藏系统代理行与「添加条件」行**（PAC 不能包含系统代理；「添加条件」改的是全局 profile 的规则），不再用灰显 + 「仅全局」旁注。
  - **路由共用**：`OmegaPopup.pageRoute = {key, profileName}` 只有一条；切换作用域时把同一条规则搬到新 key（先加新、再删旧），高亮不变；在本页模式点已生效的行不再撤销（回全局唯一入口是模式胶囊）。
  - 作用域分段控件的按钮文字**就是域名本身**（`cn.bing.com` / `bing.com`），仅子域时出现；页标题随作用域切换为完整 host 或主域名。
  - 主题 = **调色板 × 浅色 / 深色 / 跟随系统**：`ios-{light,dark,auto}`、`morandi-{...}`、`claude-{...}`（`omega-web/lib/themes/`），调色板内以 `--om-theme: <key>` 标记当前主题（auto 的两个色块各写一份），设置页据此回读；删除旧的 `default-*`（其角色由 `ios-*` 取代）。
  - popup 全部改用主题变量（`--base*` + `--softAccent` + `--separatorColor`），不再硬编码颜色；`base.css` 删除会与新 popup 冲突的旧 `.om-nav-item.om-active` / hover / `.om-edit-toggle` 覆盖。
- **实现（2026-10-18）**：
  - popup：`index.html` 重写为「页头卡片 + 一套卡片列表 + 选项卡片」，`profiles.js` 重写模式 / 作用域 / 路由 / 高亮逻辑（`applyPageProfile` / `clearPageTempRules` / `writePageRoute` / `activeProfileName`），`css/index.css` 重写为 iOS 分组列表（圆角卡片、内缩分隔线、选中行浅色底 + 对勾），`js/index.js` 写临时规则后不再关闭 popup，`js/i18n.js` / `keyboard.js` / `keyboard_help.js` 跟进新 id（`js-mode-toggle`），`keyboard.js` 的快捷键不再点击被当前模式隐藏的行。
  - 主题：`master.coffee` 改成 `builtinThemes`（三套 × 三种变体）+ `otherThemes`（base16）+ `isCurrentTheme`（读 `--om-theme` 标记）+ 下拉回填；`partials/theme.jade` 改为三张主题卡片 + 其他主题下拉 + 自定义 CSS；`options.less` 补 `.om-theme-card*` 样式；`variable.css` 把 `--softAccent` / `--separatorColor` 的兜底改为跟随表面色，使 base16 主题也能正常显示选中态。
  - 迁移：`background.coffee` 中旧的「灰聚焦环」快照修复改为——旧 iOS 快照整体换成对应 `ios-*`，其它主题只追加新的 `base.css`（不动用户选的配色）；带 `--om-theme` 标记的快照不动。
  - i18n（`en_US` 源 + `zh_CN` 同步）：新增 `options_themeBuiltin*` / `options_themeIos|Morandi|Claude|Other|Custom|AppliesEverywhere|SelectPlaceholder`、`popup_globalProfiles` / `popup_pageProfilesFor` / `popup_globalUsing` / `popup_pageUsing` / `popup_pageNotSet`；删除 R4/R9 遗留的 `popup_tempRuleScopeSubdomain|Domain|AppliesTo|ApplyProfile|Remove|Label|None|Unavailable|Help|SystemGlobalOnly*`、`popup_sectionPage|Profiles`、`popup_current`。
- **验证（2026-10-18）**：
  - `npm run build` 全绿（coffeelint 全过，jade 仅 2 条既有 warning）；omega-target 6 passing / 0 failing。
  - 本地预览（临时目录 harness：桩 `chrome.*` + 直接以构建产物供服务）截图 18 个场景：全局浅/深、本页（子域 / 主域 / 单层域名）、三套主题浅/深、无主题、base16、资源未加载、系统代理为 base、外部情景模式、无「添加条件」、键盘帮助。交互用点击顺序回读调用序列，确认「切到本页 → 选 FIDDLER → 切主域（规则搬到 `bing.com`，高亮不变）→ 选 VPN（先加新再删旧）→ 切回全局（清两条规则）」。
  - 设置页：以构建产物搭主题预览板渲染三套主题浅 / 深，卡片色板、选中按钮、下拉、自定义 CSS 区域配色自洽。
- **待实机**：重载扩展确认 popup 排版与三套主题在设置页 / 弹窗中的一致性（`_locales` 改动需重载扩展）。

### R2. （已澄清，无需实现）直连 / 系统代理 的使用习惯 — 状态：**关闭（2026-10-16）**

- 用户理解实现原理后确认：与 Clash Verge 配合的场景**直接使用 `[系统代理]`** 即可，无需“指向 Clash 端口的 FixedProfile”等额外配置；popup 习惯问题不再提出。
- 遗留提醒：`[系统代理]` 为 base profile 时临时规则 / 漏斗不可用（`SystemProfile` 无法参与 PAC）；R1 的临时路由需在扩展接管的 base（如 auto switch）下使用，按场景手动切换。

### R3. 稳定性与可维护性（非功能） — 状态：方针已确认，按需执行

- 目标：在**不追新、不改造**的前提下保证构建可用、行为稳定。
- 已确认方针：不主动同步上游（第 0 节）；不做框架 / 构建链大改造；只做**针对性加固**（如按需补 lockfile、清理过时 CI、个别依赖定向升级）；每次改动需跑通 `omega-pac` / `omega-target` 测试。
- 已完成加固（2026-10-16）：
  - 新增根目录 `.gitattributes`（`*.coffee text eol=lf`）：修复 Windows 检出（CRLF）下 coffeelint 误报长 URL 注释、`grunt` 直接失败的问题（详见 §4.3“行尾要求”）；
  - 本机首次完整跑通 `npm run deps` + `npm run build`，产出可加载扩展（见 §4.3）。

### R6. 设置页精简（移除高级条件开关 / 快速切换 / 旧版规则导出） — 状态：**已完成并提交**（2026-10-16；提交 `4437f28`）

- **背景**：华总自用精简——不需要「显示高级切换条件」开关（永久高级即可）、不用「快速切换」（点击图标循环切 profile）、不用「导出旧版规则列表」。
- **已确认决策（D8）**：① 条件类型固定为 `advancedConditionTypes`；② 快速切换端到端移除；③ 导入导出删「导出旧版规则列表」勾选；④ 顺手清理关联死代码。
- **实现（2026-10-16）**：
  - omega-web：`partials/ui.jade` 删「显示高级切换条件」「快速切换」全部 UI；`partials/io.jade` 删旧版规则导出勾选；`partials/profile_switch.jade` 条件帮助固定 `advancedConditionTypes`；`controllers/switch_profile.coffee` 删 `exportLegacyRuleList` / `basicConditionTypes` / `-showConditionTypes` watcher，新增 `updateRuleConditions`（hasUrlConditions + TrueCondition→HostWildcardCondition(`*`) 转换），`setExportRuleListHandler(exportRuleList)` 一次性设置；`controllers/profile.coffee` 删删除情景模式时清理 `-quickSwitchProfiles` 的代码；删除 `controllers/quick_switch.coffee`。
  - omega-target：`src/options.coffee` 删 `_watch` 中 quick switch 块、`_cleanUpQuickSwitchProfiles`、`reloadQuickSwitch`、基类 `setQuickSwitch`、`_replaceRefChanges` quickSwitch 段；`default_options.coffee` 删 `-enableQuickSwitch` / `-quickSwitchProfiles`。
  - extension：`module/options.coffee` 删 context menu 监听与图标点击循环（保留「无 popup 时打开 popup 页」回退）；`background_preload.coffee` 删菜单项；`external_api.coffee` 删 `reloadQuickSwitch()`；`upgrade.coffee` 删 quickSwitch 迁移字段。
  - i18n：`en_US` + `zh_CN` 删废弃 msgid（`options_showConditionTypesAdvanced*`、`options_quickSwitch`、`options_cycledProfiles*`、`options_notCycledProfiles`、`options_exportLegacyRuleList*`、`contextMenu_enableQuickSwitch`）；其它语言由 Weblate 托管，不手改。
- **语义说明**：TrueCondition→HostWildcardCondition(`*`) 转换现在无条件执行（原先仅「基本模式」下执行）；曾启用高级模式的 profile 首次打开时其 `TrueCondition` 会被改写（语义等价）。规则导出统一 `.sorl`。
- **验证（2026-10-16）**：源码与构建产物 grep 无残留；`npm run build` 全绿（coffeelint 全过；jade 仅 2 条既有 warning）；omega-target 测试 14 passing / 5 failing（失败均为 `options_sync` 既有失败，Stage B 将删除该文件及其测试）。

### R7. WebDAV 自动备份 / 恢复（替代 Gist 同步与在线恢复） — 状态：**代码完成，构建与测试通过，待实机确认**（2026-10-16）

- **背景**：替代「Gist 同步」与「在线恢复」（依赖 GitHub / 上游服务，不稳定且不再需要）。华总自用 WebDAV（群晖 / Nextcloud 等）作为单一可信备份点。
- **已确认决策（D9）**：远端**单份最新**（上传新文件后删除旧文件）+「自动备份」开关（默认关）+ 手动「立即备份 / 从备份恢复」；备份内容 = 完整 options JSON（沿用 `.bak` 格式；临时规则在 `chrome.storage.session`，天然不在备份内）；WebDAV 布局复用既有客户端约定（`zeroomega/` 子目录 + `zeroomega-commit.txt` + `zeroomega-<20hex>.json`）；凭据仅存本地（`omega.local.*`）。
- **实现（2026-10-16）**：
  - 新增 `module/options_backup.coffee`：自包含 `WebDavClient`（Basic / Bearer 认证、MKCOL 建目录、PUT 上传、GET 下载、DELETE 旧文件；移植自旧 `sync_impl_webdav.coffee`，`token` → `password`）+ `OptionsBackup` 管理器（`getConfig` / `setConfig` / `watch` / `backupNow` / `restore`）。
  - 自动备份触发：包装实例方法 `options._setOptions`（options 变更的唯一持久化入口），条件 `changes and (args?.persist ? true)`，2s 防抖；恢复后 15s 内抑制自动备份（避免 reset 触发的回推）；`_backupInProgress` / `_restoreInProgress` 防重入。
  - state 键：`optionsBackup.uri` / `.username` / `.password` / `.autoBackup` / `.lastBackup` / `.lastBackupCommit` / `.lastBackupState`（经 `omega.local.` 前缀本地存储）。
  - extension：`background.coffee` 删 `BUILTINSYNCKEY`、sync 初始化与 `chrome.storage.sync` watch 块、`_syncWatchStop`、`3.3.11` 空迁移分支；options 构造去掉 sync 参数（`new Options(storage, state, Log, proxyImpl)`）；把 `backupOptionsNow` / `restoreOptionsFromBackup` / `setOptionsBackupConfig` 挂到 options 实例供消息路由（未知方法 → target = options）；`omega_target_web.coffee` 三个 sync 方法换成上述三个；删 `module/sync/`（3 文件）与 `module/sync_storage.coffee`，`module/index.coffee` 用 `OptionsBackup` 替换 `SyncStorage`。
  - omega-target：删 `src/options_sync.coffee`、`test/options_sync.coffee`、`index.coffee` 的 `OptionsSync` 导出、`src/options.coffee` 的 `transformValueForSync` / sync 构造参数 / `setOptionsSync` 等三方法及全部 sync 残留、`log.coffee` 的 gist / sync 敏感键。
  - omega-web：`partials/io.jade` + `controllers/io.coffee` 重写备份设置区（URI / 用户名 / 密码 / 自动备份开关 / 保存设置 / 立即备份 / 从备份恢复 / 上次备份时间与状态），删「在线恢复」与整个「同步」区；`controllers/master.coffee` 删 `syncOptions` 状态读取。
  - i18n：`en_US` + `zh_CN` 删 sync / restoreOnline 族 msgid，新增 `options_group_webdavBackup` + `options_backup*`（17 条）；其它语言由 Weblate 托管，不手改。
- **交互细节**：`保存设置` 显式保存并提示；`立即备份` / `从备份恢复` 先静默保存表单值再执行；自动备份开关变更即时保存；失败经 promise reject 回 UI alert。
- **验证（2026-10-16）**：`npm run build` 全绿（coffeelint 全过，零 warning）；构建产物 grep：旧 sync 标识零残留、`OptionsBackup` / 三个备份方法已入 bundle；omega-target 测试 6 passing / 0 failing（`options_sync` 测试已删）；omega-pac 142 passing / 1 failing（既有 SOCKS5 失败，与改动无关）。
- **待实机**：重载扩展后确认备份 / 恢复链路（代码、构建与测试已通过）。

### R8. iOS 风格主题改造 + 设置页打磨 — 状态：**代码完成，构建通过，本地预览已核验**（2026-10-16）

- **背景**：华总希望界面偏 iOS 风格；借机打磨设置页观感。
- **已确认决策（D10）**：改写三套内置主题 `default-light` / `default-dark` / `default-auto` 的 base16 调色板为 iOS system 色系；`partials/theme.jade` 文案补 i18n；`base.css` 轻量打磨；**不改动 / 不删除他人主题列表**（`themes.json` 的 `others`）。
- **实现（2026-10-16）**：
  - 调色板（`omega-web/lib/themes/`）：`variable.css`（未选主题时的默认值，浅色）、`default-light.css`、`default-dark.css`、`default-auto.css`（浅色块 + `@media (prefers-color-scheme: dark)` 深色块）改为 iOS system 色系映射：

    | 变量 | 语义 | 浅色 | 深色 |
    |---|---|---|---|
    | base00 | 页面 / 控件底色 | `#ffffff` | `#1c1c1e` |
    | base01 | 次级表面（下拉 / well / 悬停） | `#f2f2f7` | `#2c2c2e` |
    | base02 | 边框 / 选中背景 | `#d1d1d6` | `#3a3a3c` |
    | base03 | 弱化文字（help-block 等） | `#8e8e93` | `#98989d` |
    | base04 / 06 / 07 | 其余前景与「浅背景」 | `#3c3c43` / `#000000` / `#000000` | `#c7c7cc` / `#f2f2f7` / `#ffffff` |
    | base05 | 正文 | `#1c1c1e` | `#ffffff` |
    | base08 | negative（红） | `#ff3b30` | `#ff453a` |
    | base09 / 0A | primary（链接）/ info（选中态） | `#007aff` | `#0a84ff` |
    | base0B | positive（绿） | `#34c759` | `#30d158` |
    | base0E | warning（橙） | `#ff9500` | `#ff9f0a` |
    | base0C / 0D / 0F | 备用（青 / 靛 / 棕） | `#32ade6` / `#5856d6` / `#a2845e` | `#64d2ff` / `#5e5ce6` / `#ac8e68` |

  - `base0A`（infoColor，驱动侧边栏选中项 / info 提示 / 焦点描边）取 systemBlue，与 `base09`（primaryColor，链接）同色——iOS 的链接与选中态同为蓝。
  - 四份调色板均加 `color-scheme`（浅色 / 深色；auto 两态各一），让原生控件与滚动条跟随主题。
  - `base.css` 末尾新增「iOS-style polish」段（**只做覆盖，不改既有规则**）：`::selection`、`::placeholder`、`accent-color`（复选框 / 单选框用 iOS 蓝）、控件圆角 6px（含 `.dropdown-menu` 首尾项、`.input-group-addon` 对齐）、`.form-control` 的 border/box-shadow 过渡、滚动条 8px。（`::selection` 与按钮 hover / focus 描边的取色见 D12 修正；输入框聚焦沿用原有 `0 0 8px var(--infoColor)` 柔光环。）
  - `partials/theme.jade`：`Theme / Dark / Light / Auto / Clear / CSS Wiki` 硬编码英文改走 i18n（`options_theme` / `options_themeDark` / `options_themeLight` / `options_themeAuto` / `options_themeClear` / `options_themeCssWiki`，`en_US` + `zh_CN` 同步）。
  - `src/less/options.less`：删除 Stage B 后失效的 `.use-built-in-sync-enhance-tip` / `.sync-form *` 死样式。
- **验证（2026-10-16）**：`npm run build` 全绿；构建产物中调色板 / `theme.html` / `_locales` 文案均含新内容；本地静态预览（临时目录，不入库）逐项核对浅色 / 深色下的导航选中项、表单（input-group / disabled / 焦点环）、按钮、alert、表格、复选框与 popup 导航项，`var(--infoColor)` 与焦点描边经 `getComputedStyle` 确认为 `rgb(0, 122, 255)`。
- **修正（2026-10-16，D12）**：iOS 色系「看着不对」的根因不是调色板值，而是**交互态用了灰**——iOS polish 段把 `--selectionBackground`（base02 灰）当文字选中底、输入框聚焦环、按钮悬停描边用。改为：`::selection` 用 `--primaryColor` + 白字；删掉那条硬灰聚焦环（回落到原有 `0 0 8px var(--infoColor)` 柔光环）；按钮 hover / focus 描边用 `--primaryColor`。`variable.css` 的 base16 语义别名保持上游原样（primary=base09、info=base0A、secondary=base0D、warning=base0E），不改动他人主题的取色。主题是**快照**存在选项里，`background.coffee` 启动时按原主题（auto / dark / light，按标记推断）重建一次（识别标记 = 旧灰聚焦环 `0 0 0 3px var(--selectionBackground)`）；手改过的不动。
- **待实机**：重载扩展后开一次设置页确认配色（快照会自动刷新，无需手动重选主题）。
- **复核（2026-10-17）**：以构建产物搭「设置页主题预览板」（Bootstrap + `options.css` + `variable` / 主题 / `base.css`，按 `options.html` 的加载顺序）分别渲染浅色 / 深色：侧边栏选中项、链接、输入框聚焦、well、表格、按钮、alert、popup 导航项均取色自洽，无灰环 / 灰选中底。**已知既有局限（非本次引入）**：`.alert-warning` 等 Bootstrap 语境色与 `table .success` 行是硬编码浅色，深色主题下仍是浅底——上游一直如此，属独立议题，未在本次改动范围内。

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

- 各模块**当前没有 lockfile**；依赖安装结果不完全可复现（见 R3）。
- 本机（2026-10-16，Node 22）测试基线：omega-pac 142 通过 / **1 个既有失败**（`Profiles #pacResult` SOCKS5，疑依赖版本差异，与改动无关）；omega-target：`temp_rules` 6 个新增用例全通过，`options_sync` 有 **5 个既有失败**（sinon 1.x 定时器与 Node 22 不兼容）。新增/修改功能请对照此基线判断是否引入回归。
- **构建（2026-10-16 已完整跑通一次）**：`npm run deps` → `npm run build` 全程无错误（bower 依赖仍可从 GitHub 解析），产出 `omega-target-chromium-extension/build`（可加载的未打包扩展）。各模块 `grunt` 的 `default` 均含 `coffeelint`；改完代码本地至少跑对应模块的 `grunt`（或整体 `npm run build`）。
- **行尾要求（重要）**：仓库根 `.gitattributes` 固定 `*.coffee text eol=lf`。coffeelint 的 `max_line_length` 对“整行 URL 注释”的豁免匹配不了 CRLF 行尾，Windows（`core.autocrlf=true`）检出为 CRLF 时会误报超长行、让 `grunt` 失败；**不要删该文件，也不要把 coffee 工作区改回 CRLF**。
- **文案目录缓存（重要）**：`build/_locales/*/messages.json` 在**扩展加载时**一次性读入内存；改动 `omega-locales` 后必须「重新加载扩展」才生效。popup 的 HTML/CSS/JS 每次打开会从磁盘重读，因此会出现“新界面 + 空文案”的假象，勿误判为渲染 bug（2026-10-16 实机踩坑）。

### 4.4 关键运行机制

- **Profile 模型**：`omega-pac` 把 profile 编译为 PAC 脚本或固定配置，target 侧 `proxyImpl` 应用到浏览器。
- **临时规则**：隐藏的 `_tempProfile`（SwitchProfile）+ `chrome.storage.session`（**浏览器重启即失效**）；入口有 popup 漏斗（支持“当前子域 / 整个主域”作用域切换，默认当前子域）、请求信息详情、网络监测页、临时规则管理器；临时规则按域名层级排序（子域在前，首条命中优先）；`getPageInfo()` 为 popup 提供 `domain / host / subdomain / tempRuleProfileName（主域级）/ tempRuleHostProfileName（子域级）`。
- **两套 popup**：默认 `popup-iframe.html` 内嵌 `popup/index.html`（新版原生 JS；顶部页卡片 = 站点名 + 一个「全局 / 本页」状态胶囊（点击切换，只显示当前态）+ 副标题写明实际路由，下面**同一套**情景模式列表。切到「全局」= 跟随全局并清除本页临时规则，点选应用该全局 profile；切到「本页」= 用本页独立情景模式，点选写入**当前作用域**的临时规则，子域与主域共用同一条路由（切换作用域把规则搬到新 key，不用重选），系统代理与「添加条件」在本页模式下隐藏；键盘 `T` 切换。「添加条件」与「请求信息」表单仍走 Angular 版 `popup.html`（`popup.jade` + `popup.coffee`）。
- **请求监控**（默认关闭）：`webRequest` 统计每标签页失败请求 → popup 顶部“N 资源未加载”入口（详情模式下可按 host 添加条件 / 临时条件）。

## 5. 决策日志（Decision Log）

| # | 决策 | 备选方案 | 理由 |
|---|---|---|---|
| D1 | 临时路由作用域 = **当前子域为准**（`postest.findfine.com`，含更深层子域） | 多级上溯 / URL 路径级 / 仅当前标签页 | 与现有临时规则模型一致、改动最小、覆盖实际场景 |
| D2 | **不做**框架与构建链大改造，仅针对性加固（见 R3） | 迁移 Vite / esbuild、重写 UI 框架 | 现有链虽老但可用；大改造风险高、收益低 |
| D3 | **不主动与上游同步**（不合并上游、不提 PR） | 定期跟随上游 master | 华总明确要求 |
| D4 | 任务开始第一步 = 确认需求是否已满足 / 可用 | — | 华总明确要求，避免重复实现 |
| D5 | 临时覆盖按**子域（host）**生效，**不做**按标签页（per-tab） | 本地代理 / 按标签页路由 | `chrome.proxy` 是浏览器级全局配置、无法按标签页；“按环境子域切换”这一主流场景用子域覆盖可等价满足 |
| D6 | popup 菜单分区化：**「本页路由」卡片 + 「全局情景模式」列表**，本页卡片明示临时规则命中结果；作用域选择用分段控件 | 仅在列表行上加角标 / 维持原双重高亮 | R1 实机暴露“双重高亮”歧义（全局 auto switch vs 本页临时选择）；分区后不下拉也能一眼看出本页实际走什么，且区分“全局当前”与“本页覆盖”两个概念 |
| D7 | 本页路由 = **互斥开关**（「本页覆盖全局」）：OFF 跟随全局；**点击任意全局行 = 应用全局 + 清除本页临时规则**（host + 主域）；下拉列表与全局列表同序（系统代理为禁用行） | 保持临时/全局并列展示 / 点全局时保留临时规则 / 隐藏当前全局等旧过滤 | R4 实机后华总指出“临时和全局应该互斥”“这个临时应该要变成全局或 无”；开关让“本页是否被覆盖”一眼可见，两列表同序消除“情景范围不一致”观感 |
| D11 | popup 只留**一套列表** + 顶部「全局 / 当前」分段按钮。按钮是「本页跟随谁」的开关：切到**全局** = 跟随全局并清除本页临时规则（host + 主域），列表高亮 = 当前全局；切到**当前** = 本页用独立情景模式，不改动已有规则，列表高亮 = 该作用域已有的临时规则（浅蓝底 + 勾），点选写入该作用域的临时规则（再点同项即撤销）。作用域（本子域 / 整个主域）仅在「当前」且为子域时出现 | 保留 R5 的两张卡片 + 「本页覆盖全局」开关 | R5 实机后华总指出页面乱：开关文案绕、两套列表重复；一个按钮决定这一套列表的含义即可。切到「全局」即清覆盖，是为了让「高亮哪一行」与「实际走什么路由」永远一致（否则会重现 R4/R5 的“双重状态”困惑） |
| D12 | 保留 iOS 调色板，只修**交互态的灰**：`::selection`、输入框聚焦、按钮悬停描边改用主色；旧主题快照由 background 启动时按原主题重建一次 | 整体改回 Tomorrow / 撤销 iOS 方向 | 「iOS 色彩不对」的根因不是调色板值，而是 polish 把 `--selectionBackground`（base02 灰）当成文字选中底 / 聚焦环 / 描边用。base16 语义别名保持上游原样（primary=base09、info=base0A），不波及其它主题 |
| D8 | 设置页精简：条件类型**固定为高级列表**（删开关）；快速切换**端到端移除**；删「导出旧版规则列表」 | 保留开关 / 仅隐藏 UI / 保留快速切换 | 自用场景不需要“基础/高级条件”双模式与图标循环切换；端到端删除可去掉 context menu、storage 字段与迁移代码 |
| D9 | WebDAV 备份 = **单份最新 + 自动备份开关 + 手动恢复**；复用 `.bak` 格式与既有 WebDAV 目录约定 | 多版本历史 / 保留 Gist 同步 | 个人备份点单一可信、实现简单；复用既有客户端布局与恢复链路；Gist / 内置同步对外依赖不稳定且不再需要 |
| D10 | 三套内置主题改造为 **iOS system 色系** + `theme.jade` 文案 i18n + `base.css` 打磨 | 新增一套主题 / 全量重写样式体系 | 不改结构、风险低；内置主题覆盖浅色 / 深色 / 自动三态即可；避免动他人主题列表 |
| D13 | popup：**一个状态胶囊**（只显示 `全局` / `本页`，点击切换）+ 一套列表；切到「全局」清本页临时规则；本页模式隐藏系统代理与「添加条件」；子域 / 主域**共用一条路由**（切作用域搬规则，不重选）；页标题随作用域显示完整 host 或主域名。主题：**三套调色板 × 浅 / 深 / 跟随系统**（`ios-*` / `morandi-*` / `claude-*`），popup 全部改用主题变量 | 保留 R9 的双分段按钮；保留「仅全局」旁注；两套独立的作用域规则；继续只用 `default-*` 一套 iOS 主题 | R9 实机后华总要求「一个按钮、点击切换」，旁注与并列状态制造歧义；两条独立规则会逼用户重选 profile，而实际场景只是换作用域；主题分散在两套界面才导致“设置页好看、弹窗刺眼”，统一变量后一处改动两处生效 |
