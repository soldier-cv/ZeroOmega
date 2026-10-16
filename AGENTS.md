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

## 3. 需求台账（Requirements Ledger）

> 新需求一律追加到本节；写清：背景 / 已确认决策 / 现状与 workaround / 已知缺陷 / 相关代码 / 状态。

### R1. 当前子域级临时路由（Temp Rule） — 状态：**已实现**（2026-10-16；单元测试通过，待实机验证）

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
- **待验证**：实机加载 `omega-target-chromium-extension/build`，验证漏斗作用域切换与真实路由（场景：auto switch 下 dev 子域临时直连，生产不受影响）。
- **相关代码**：
  - 核心：`omega-target/src/options.coffee`（`getTempRules` / `addTempRule` / `queryTempRule` / session 恢复）
  - 扩展侧：`omega-target-chromium-extension/src/module/options.coffee`（`getPageInfo`，`chrome.storage.session` 持久化）
  - 新 popup：`omega-web/src/popup/js/profiles.js`（漏斗下拉 `createTempRuleDropdown`）+ `omega-web/src/popup/js/index.js`
  - Angular 表单版：`omega-web/src/coffee/popup.coffee` + `omega-web/src/popup.jade`
  - 管理器：`omega-web/src/popup/temp_rules/`
  - 匹配语义：`omega-pac/src/conditions.coffee`（`HostWildcardCondition`）——`*.x.y` 匹配 `x.y` 本身及其任意深度子域；裸 host 精确匹配

### R4. popup 菜单重构美化 + 本页路由表达 — 状态：**已实现**（2026-10-16；本地预览逐场景核验，待实机确认）

- **背景**：R1 实机查看 popup 时华总提出两点：① 临时规则生效时主列表仍高亮 `auto switch`，与下拉里高亮的 `[直接连接]`（临时规则目标）形成“双重高亮”，用户困惑“究竟走的什么路由”；② 下拉内部的作用域选择（子域/主域）样式与列表项混同、域名被截断（如 `postest.findfine.c…`），看不出可点。要求“整个菜单做个美化重构”。
- **已确认决策**：菜单分区化——「本页路由」卡片 + 「全局情景模式」列表，两个概念在视觉上彻底分开；本页卡片直接回答“本页走什么”：显示当前命中的临时规则（profile chip），未设置/不可用时给出明确文案与说明 tooltip；作用域选择改为**分段控件**（本子域 / 整个主域）+ “作用于 `<host>`”全文展示（不截断）；全局列表当前项加「当前」标签。**仅重构表达，不改路由语义**（D1/D5 不变：临时规则优先于 base、子域规则优先于主域规则）。
- **实现（2026-10-16）**：
  - `omega-web/src/popup/index.html`：骨架重写——独立隐藏模板 `#js-profile-tpl`（克隆后移除 `om-hidden`，修复原“模板即直连行”的重复 id 隐患）、本页路由卡片（host + 临时规则行）、全局情景模式卡片（直连/系统/自定义/添加条件）、资源未加载警告条置顶；
  - `omega-web/src/popup/js/profiles.js`：新增 `renderPageSection` / `updateTempRuleRow` / `createProfileChip` / `addCurrentChip` / `tempRuleForPage`；`createTempRuleDropdown` 重做（`om-segmented` 分段控件 + `om-scope-hint` 作用于行 + “应用情景模式”列表 + 「撤销该作用域的临时规则」行，撤销走 `addTempRule(key, name, -1)`）；取消 `createGlobeIcon`（内置直连/系统行与自定义行统一为单图标着色）；
  - `omega-web/src/popup/js/index.js`：`addTempRule(domain, profileName, toggle)` 透传 toggle（-1 = 强制删除，与 temp_rules 管理器、network 页调用约定一致）；
  - `omega-web/src/popup/js/i18n.js`：补分区标题与临时规则标签；
  - `omega-web/src/popup/css/index.css`：整体重写（系统字体栈；白色圆角卡片 + 灰色分区标题；hover/focus 环；chip；分段控件；下拉内嵌面板；琥珀色警告条）；
  - i18n（`en_US` + `zh_CN` 同步）：新增 `popup_sectionPage` / `popup_sectionProfiles` / `popup_tempRuleLabel` / `popup_tempRuleNone` / `popup_tempRuleUnavailable` / `popup_tempRuleUnavailableHelp` / `popup_tempRuleHelp` / `popup_tempRuleScope` / `popup_tempRuleAppliesTo`（`$DOMAIN$`）/ `popup_tempRuleApplyProfile` / `popup_tempRuleRemove` / `popup_current`；改义 `popup_tempRuleScopeSubdomain` / `popup_tempRuleScopeDomain` 为短标签（完整域名移到“作用于”行）。
- **验证方式**：本地临时静态预览（本机临时目录下的 harness：模拟 `chrome.*` / `OmegaTargetPopup`，直接读取源文件，不入库）逐场景截图核对：有子域规则（高亮 chip + 撤销行）/ 无规则 / 仅主域规则 / 单层域名（无分段控件）/ 全局不支持临时规则（不可用）/ 资源未加载警告 / 键盘帮助徽标；`npm run build` 通过，构建产物与源文件逐字节一致。
- **待验证**：实机加载 `omega-target-chromium-extension/build`，确认交互（点击应用/撤销、键盘导航与 `T` 快捷键、帮助徽标）。
- **注意（后续改动约束）**：popup 的 `js-*` id 与 `.om-nav` 根节点是键盘导航（`keyboard.js` TreeWalker 按 tab 序行走）与 `keyboard_help.js` 帮助徽标的依赖；菜单行结构请保持“`.om-nav-item > a`（flex：图标 + 名称 + 附属元素）”。

### R2. （已澄清，无需实现）直连 / 系统代理 的使用习惯 — 状态：**关闭（2026-10-16）**

- 用户理解实现原理后确认：与 Clash Verge 配合的场景**直接使用 `[系统代理]`** 即可，无需“指向 Clash 端口的 FixedProfile”等额外配置；popup 习惯问题不再提出。
- 遗留提醒：`[系统代理]` 为 base profile 时临时规则 / 漏斗不可用（`SystemProfile` 无法参与 PAC）；R1 的临时路由需在扩展接管的 base（如 auto switch）下使用，按场景手动切换。

### R3. 稳定性与可维护性（非功能） — 状态：方针已确认，按需执行

- 目标：在**不追新、不改造**的前提下保证构建可用、行为稳定。
- 已确认方针：不主动同步上游（第 0 节）；不做框架 / 构建链大改造；只做**针对性加固**（如按需补 lockfile、清理过时 CI、个别依赖定向升级）；每次改动需跑通 `omega-pac` / `omega-target` 测试。
- 已完成加固（2026-10-16）：
  - 新增根目录 `.gitattributes`（`*.coffee text eol=lf`）：修复 Windows 检出（CRLF）下 coffeelint 误报长 URL 注释、`grunt` 直接失败的问题（详见 §4.3“行尾要求”）；
  - 本机首次完整跑通 `npm run deps` + `npm run build`，产出可加载扩展（见 §4.3）。

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

### 4.4 关键运行机制

- **Profile 模型**：`omega-pac` 把 profile 编译为 PAC 脚本或固定配置，target 侧 `proxyImpl` 应用到浏览器。
- **临时规则**：隐藏的 `_tempProfile`（SwitchProfile）+ `chrome.storage.session`（**浏览器重启即失效**）；入口有 popup 漏斗（支持“当前子域 / 整个主域”作用域切换，默认当前子域）、请求信息详情、网络监测页、临时规则管理器；临时规则按域名层级排序（子域在前，首条命中优先）；`getPageInfo()` 为 popup 提供 `domain / host / subdomain / tempRuleProfileName（主域级）/ tempRuleHostProfileName（子域级）`。
- **两套 popup**：默认 `popup-iframe.html` 内嵌 `popup/index.html`（新版原生 JS；菜单分区为「本页路由」卡片——host + 临时规则命中结果 /「全局情景模式」列表，临时规则下拉内置作用域分段控件；“添加条件”与“请求信息”表单仍走 Angular 版 `popup.html`（`popup.jade` + `popup.coffee`）。
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
