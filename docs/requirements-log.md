# ZeroOmega 需求与决策档案（从 AGENTS.md 迁出，2026-11-17）

> 历史档案，按 R 编号组织：需求的背景、实现、验证、相关代码，以及决策与运行机制的原文。当前约束以 AGENTS.md 为准。

> 2026-11-17 再次瘦身时与本文件已有的 R1–R15 旧档合并。同一条 R 逐字相同则只保留一份；有出入的 R7、R14、R15 以当时 AGENTS.md 原文为准（含后续修订注记）。R16–R25 为本次补入。该基线没有 R26、R27。

## 需求台账（原始记录，原样保留）

## 3. 需求台账（Requirements Ledger）

> 新需求一律追加到本节；写清：背景 / 已确认决策 / 现状与 workaround / 已知缺陷 / 相关代码 / 状态。

<a id="r1"></a>

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

<a id="r2"></a>

### R2. （已澄清，无需实现）直连 / 系统代理 的使用习惯 — 状态：**关闭（2026-10-16）**

- 用户理解实现原理后确认：与 Clash Verge 配合的场景**直接使用 `[系统代理]`** 即可，无需“指向 Clash 端口的 FixedProfile”等额外配置；popup 习惯问题不再提出。
- 遗留提醒：`[系统代理]` 为 base profile 时临时规则 / 漏斗不可用（`SystemProfile` 无法参与 PAC）；R1 的临时路由需在扩展接管的 base（如 auto switch）下使用，按场景手动切换。

<a id="r3"></a>

### R3. 稳定性与可维护性（非功能） — 状态：方针已确认，按需执行

- 目标：在**不追新、不改造**的前提下保证构建可用、行为稳定。
- 已确认方针：不主动同步上游（第 0 节）；不做框架 / 构建链大改造；只做**针对性加固**（如按需补 lockfile、清理过时 CI、个别依赖定向升级）；每次改动需跑通 `omega-pac` / `omega-target` 测试。
- 已完成加固（2026-10-16）：
  - 新增根目录 `.gitattributes`（`*.coffee text eol=lf`）：修复 Windows 检出（CRLF）下 coffeelint 误报长 URL 注释、`grunt` 直接失败的问题（详见 §4.3“行尾要求”）；
  - 本机首次完整跑通 `npm run deps` + `npm run build`，产出可加载扩展（见 §4.3）。

<a id="r4"></a>

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

<a id="r5"></a>

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

<a id="r6"></a>

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

<a id="r7"></a>

### R7. WebDAV 自动备份 / 恢复（替代 Gist 同步与在线恢复） — 状态：**代码完成，构建与测试通过，待实机确认**（2026-10-16）

- **背景**：替代「Gist 同步」与「在线恢复」（依赖 GitHub / 上游服务，不稳定且不再需要）。华总自用 WebDAV（群晖 / Nextcloud 等）作为单一可信备份点。
- **已确认决策（D9）**：远端**单份最新**（上传新文件后删除旧文件；**保留策略已由 R23 / D26 改为保留最近 3 份**）+「自动备份」开关（默认关）+ 手动「立即备份 / 从备份恢复」；备份内容 = 完整 options JSON（沿用 `.bak` 格式；临时规则在 `chrome.storage.session`，天然不在备份内）；WebDAV 布局复用既有客户端约定（`zeroomega/` 子目录 + `zeroomega-commit.txt` + `zeroomega-<20hex>.json`）；凭据仅存本地（`omega.local.*`）。
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

<a id="r8"></a>

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

<a id="r9"></a>

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

<a id="r10"></a>

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

<a id="r11"></a>

### R11. popup 本页 / 全局互不污染 — 状态：**构建与交互校验通过，待实机确认**（2026-10-20）

- **背景**：R10 实机后华总反馈“用一下就把本来可用的弄坏了”。复核确认是 popup 交互层在改一条临时规则时连带改写 / 删除别的站点正在用的规则，而临时规则是 PAC 第一层且存于 `chrome.storage.session`（删了即失、无撤销）。路由引擎本身（`addTempRule` 的层级插入、首条命中）没有问题。
- **已确认的破坏路径（均在 `omega-web/src/popup/js/profiles.js`，R10 引入或放大）**：
  1. `writePageRoute()` 写当前 key 后**删除其它 key** 的规则——在子域上点一下会顺手删掉整域规则，该域其它子域失去覆盖；
  2. 切换作用域（本子域 / 整个主域）走同一函数，**把规则搬走**——只是换个范围看看，别的子域的覆盖就没了；
  3. 切到「全局」（胶囊）与点任意全局行（`applyGlobalProfile`）都调用 `clearPageTempRules()`，**删除 host + 整域两条规则**；
  4. 打开 popup 时把**继承来的整域规则**当成“本页路由”（`pageRouteFromInfo` 取第一条），于是胶囊显示「本页」、作用域落在主域，随后在「本页」里点选改的是整域 key，所有子域跟着变；
  5. 点已生效的那一行直接 return，不再撤销，逼用户去点胶囊走第 3 条。
- **已确认决策（D14）**：一次点击只碰**当前作用域的那一条**规则，绝不隐式改写或删除另一条。
  - 作用域按钮只决定“下一次点选写到哪”，不搬规则；
  - 切到「全局」与点全局情景模式行都**不再删除**任何临时规则，只切换视图 / 应用全局 profile；
  - 「本页」只认**本 host 自己的规则**；继承来的整域规则在「全局」视图里以一条提示呈现（`popup_domainOverride`，含显式「撤销」按钮），「本页」视图不显示、也不能改它；
  - 恢复“再点一次已生效的那一行 = 撤销这一条”（只撤销当前作用域）。
- **实现（2026-10-20）**：`profiles.js` 重写 `pageRouteFromInfo` / `setPageScope` / `writePageRoute` / `setMode` / `applyPageProfile`，删除 `clearPageTempRules`；`index.js` 删除 `applyGlobalProfile`（全局行直接 `applyProfile`）；`index.html` 新增 `#js-inherited` 提示行；`css/index.css` 补该行样式，并把模式胶囊与作用域选中态从“反色实心底”改为 iOS 分段控件式的“浅色底 + 主色文字”（跟随 `--softAccent` / `--primaryColor`，四套主题通用）。i18n（`en_US` + `zh_CN`）新增 `popup_domainOverride` / `popup_domainOverrideClear`，改写 `popup_modeHelp` / `popup_pageNotSet`。
- **验证（2026-10-20）**：`npm run build` 全绿。以构建产物 + 真实 `omega-target` Options 搭临时校验台（不入库）驱动真实 popup，47 条断言全过，覆盖：切作用域不搬规则、切全局不删规则、点全局行不删本页规则、在子域上点选不改整域规则、撤销只删当前这一条、整域覆盖提示只在全局模式出现且撤销不影响其它 host 规则、系统代理为 base 时「本页」隐藏。四套主题（ios / morandi × 浅色深色）在 300px 宽度下截图核对。
- **待实机**：重载扩展后确认（`_locales` 需重载才生效）。
- **部分修订（2026-10-28，见 R12 / D15）**：本条「继承来的整域规则只在『全局』视图呈现」已改——「本页」视图也勾选实际生效的整域路由并显示提示，点它只为本 host 写规则；其余约束（一次点击只碰当前作用域、切全局不删规则、撤销只删这一条）仍有效。

<a id="r12"></a>

### R12. popup 记住「全局 / 本页」与作用域 + 子域上可见继承的整域规则 — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-10-28）

- **背景（华总反馈）**：①「子域名选择似乎不生效」；②「从全局切换到本页，勾选过了，窗口关闭后再打开没有保持原样，希望记住，而不是每次打开都回到全局；情景模式勾选要记住」。
- **复现与定位（真实 Chromium + 构建产物 + 桩 tab，非本地预览）**：
  - 路由引擎无问题：子域临时规则写入 `*.postest.findfine.com`、PAC 内含该 host、重开 popup 仍能读回（`chrome.proxy.settings` / `chrome.storage.session` 均正确）。
  - 问题 ①：子域**只有整域规则**（本 host 无自己的规则）时，「本页」视图既不勾选任何情景模式、也隐藏了「同时受整域规则覆盖」的提示 → 看起来这个子域根本没有路由，于是作用域选择像是不生效。整域规则本身是生效的（`popup_domainOverride` 只在全局视图出现过）。
  - 问题 ②：模式完全由「本 host 有没有自己的临时规则」推导，且作用域每次重置为子域——所以只要本 host 没有自己的规则（例如只设过整域规则、或刚切到本页还没点），重开必然回到「全局」，作用域选择也不保留。
- **已确认决策（D15）**：模式与作用域是**「下一次点击改哪里」的界面偏好**，不是路由状态，按 host 记住（`localStorage`：`omega.popup.mode:<host>` / `omega.popup.scope:<host>`）；「本页」视图把**实际生效**的情景模式（本 host 自己的规则，否则继承来的整域规则）勾选出来，「同时受整域规则覆盖」提示在两种视图都显示；点这条被勾选但非本作用域所有的行时，**只为本 host 写一条自己的规则**（钉住），不去动整域规则。
- **实现（2026-10-28，`omega-web/src/popup/js/profiles.js`）**：
  - 新增 `MODE_PREF` / `SCOPE_PREF` 与 `loadPref` / `savePref` / `prefKey`（按 host 拼 key，取不到 host 时读写都跳过）；
  - `renderPageSection` 改用 `restoredScope()` / `restoredMode()`：第一次使用（无存档）仍按「本 host 有规则 → 本页，否则全局」推导；存档为 `page` 但当前页不支持本页（如系统代理为 base）时回落全局；
  - `setMode` / `setPageScope` 在改变选择时写入对应偏好；
  - 新增 `effectivePageRule()`（本 host 规则 → 否则继承的整域规则），`subtitleText` 与 `activeProfileName` 改用它，`renderInherited(note)` 去掉 `pageMode` 判断（两种视图都显示）。
- **验证（2026-10-28）**：
  - `npm run build` 全绿；`build/popup/js/profiles.js` 与源逐字节一致。
  - 端到端（临时目录 harness，不入库：headless Chromium 加载 `build/` 未打包扩展，`--host-resolver-rules` 把 `*.findfine.com` 指到本地站点，桩 `chrome.tabs.query` 指向真实站点 tab，直接驱动真实 popup 与真实后台）：
    - 子域只设整域规则：「本页」立即勾选 `proxy` 且显示整域提示；点该行后为本 host 写入规则，原整域规则不动；
    - 无任何规则时切到「本页 + 整域作用域」，关闭重开 → 仍是「本页 + 整域作用域」；
    - 同一浏览器里另一个子域（`beta.findfine.com`）重开仍是「全局」（偏好按 host 隔离）；
    - 切回「全局」重开仍是「全局」；在「本页」点 `proxy` 后重开 → 「本页 + proxy 勾选」；
    - 点已生效行仍只撤销**这一条**（D14 语义保留），撤销后若存在整域规则则自动勾回该整域路由，不会显示成「无路由」；
    - 冷启动（杀掉 service worker 后重开 popup）与原有「子域 / 主域各写一条规则、互不搬运」用例均无回归。
- **影响 / 修订**：D14 的「继承来的整域规则在『本页』视图不显示」被本决策修订（改为显示、但点它只写本 host 规则）；「一次点击只碰当前作用域那一条」「切到全局不删临时规则」等其余 D14 约束不变。
- **再次修订（2026-10-28，见 R13 / D16）**：本条验证里「点已生效行仍只撤销这一条」已改——行点击一律只应用，撤销改为列表标题旁的显式按钮；整域提示行里的「撤销」保留。

<a id="r13"></a>

### R13. popup 交互收敛：点击即应用、撤销显式化、说明实际路由 — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-10-28）

- **背景**：华总要求「优化交互设计，站在用户角度分析一遍再做优化」。上一版（R12 之后）逐条按用户视角复盘，发现以下问题：
  1. **再点一次已生效的行会静默删掉规则**——无从预见、没有任何提示，是「勾选没记住」错觉的主要来源（实机很容易踩到：想「确认一下」再点一遍，规则就没了）。
  2. **「本页」未设置时只说「在下方选一个情景模式」**，没说明此刻实际走什么——其实临时规则不存在时 PAC 落在全局情景模式，用户会以为本页没有代理。
  3. **「撤销」只在提示行里出现一次**，且只覆盖整域规则；本页自己的规则只能靠「再点一次」（见第 1 条）。
  4. 临时规则是会话级（浏览器重启即失效），界面上无处说明。
- **已确认决策（D16）**：列表行点击 = **只应用、幂等**，永不做删除；撤销改为列表标题右侧的显式动作（「撤销本页规则」/「撤销主域规则」，仅在当前作用域确有规则时出现）；「本页」无生效规则时副标题写「跟随全局：X」，如实反映 PAC 回落；临时规则易失性放进行内 tooltip。
- **实现（2026-10-28）**：
  - `omega-web/src/popup/index.html`：列表标题改为 `.om-section-head`（标题 + `#js-clear-rule` 按钮）；
  - `omega-web/src/popup/js/profiles.js`：`applyPageProfile` 去掉「同 profile 即删除」分支，一律走 `writePageRoute`；新增 `bindClearRule`；`applyMode` 维护撤销按钮的可见性与文案（按作用域区分本页 / 主域）；`subtitleText` 抽出 `globalRouteName`，本页无规则时用 `popup_pageFollowGlobal` 显示跟随的全局情景模式；
  - `omega-web/src/popup/css/index.css`：`.om-section-head` / `.om-section-action` 样式；标题省略号仍在；
  - i18n（`en_US` + `zh_CN`）：新增 `popup_pageFollowGlobal` / `popup_clearPageRule` / `popup_clearDomainRule` / `popup_tempRuleLifetime`；改写 `popup_modeHelp`；删除 `popup_pageNotSet`。
- **验证（2026-10-28）**：真实 Chromium + 构建产物的端到端 harness（同 R12）逐状态核对：本页未设置 → 「跟随全局：auto switch」且不勾任何行；应用 `proxy` → 勾选 + 「撤销本页规则」；**再点同一行规则不变**（后台 `getTempRules` 仍为 `postest.findfine.com=proxy`）；改点 `direct` → 替换；点「撤销本页规则」→ 回到跟随全局；主域作用域 → 「撤销主域规则」；子域只有继承的整域规则时 → 勾选 + 提示行 + 不出现撤销按钮（没有自己的规则可撤）。截图核对标题行与撤销按钮对齐。
- **修订**：R11 / D14 的「再点已生效的行只撤销这一条」被本决策取代（撤销改为显式按钮）；「一次点击只碰当前作用域那一条」「切到全局不删规则」等其余约束不变。

<a id="r14"></a>

### R14. 扩展内更新检查（发布清单 → 复制命令 → 重载扩展） — 状态：**构建通过，真实服务器与真实 Chromium 校验通过，待实机确认**（2026-10-28）

- **背景**：更新一直靠手动记命令；华总问「是否能够集成更新，目前有个命令能够从我本地服务器拉最新的」。发布侧其实已经自动化：`.woodpecker.yml` 在 `v*` tag 上构建 → `npm run release` → 把 `chromium-release.zip` / `firefox-release.zip` + sha256 拷到 `/res/zeroomega/`，并跑 `tools/ci/refresh_res_manifest.py` 写 `manifest.json`（含 `version` 与 `links[0].command`）。
- **技术边界（重要）**：未打包（unpacked）扩展**不能改写自身文件**；Windows 版 Chrome 也已封掉自助 `.crx` 静默更新（INSTALL.md 里同样记着这一点）。所以「集成」只能是：检查版本 + 交给人执行同一条命令 + 让新文件生效，而不是静默自更新。
- **已确认决策（D17）**：popup 底部卡片加两行——「检查更新」常驻（无新版时显示「已是最新（vX）」），有新版时变为主色「有新版本 vX · 复制更新命令」，点击复制**服务器清单里给的命令**（不硬编码，回退用同一套下载+解压命令）；复制后用 `chrome.runtime.reload()` 提供「重载扩展」行完成最后一步。检查结果缓存在 `localStorage['omega.update']`，**6 小时**内复用缓存（打开 popup 不做无谓请求），可手动点击强制重检；失败显示「检查更新失败，点此重试」；剪贴板被拒时回退打开 `INSTALL.md`。版本比较只取数字段（`v3.6.4-custom` 与 `3.6.4` 等价）。
- **实现（2026-10-28）**：
  - 新增 `omega-web/src/popup/js/update.js`（自包含；`$script.ready('om-target')` 后初始化）：`fetch` `http://100.64.0.88:8088/res/zeroomega/manifest.json`（`cache: 'no-store'`）、`isNewer`、状态机（checking / available / copied / guide / latest / failed）、`navigator.clipboard` + textarea 回退、`chrome.runtime.reload()`；
  - `omega-web/src/popup/index.html`：底部卡片新增 `#js-update-row` / `#js-reload-row`（`.om-option-row`）；
  - `omega-web/src/popup/js/loader.js`：把 `js/update.js` 加入 `om-main` 脚本组；
  - `omega-web/src/popup/css/index.css`：`.om-update-new`（主色行 / 主色图标）、`.om-nav-item.om-disabled`、`.om-option-row` 文本省略号，补 `glyphicon-cloud-download`（`\e197`）与 `glyphicon-repeat`（`\e030`）；
  - i18n（`en_US` + `zh_CN`）：`popup_checkUpdate` / `popup_checkUpdateHelp` / `popup_updateChecking` / `popup_updateAvailable` / `popup_updateHelp` / `popup_updateCopied` / `popup_updateOpenedGuide` / `popup_updateLatest` / `popup_updateFailed` / `popup_reloadExtension` / `popup_reloadHelp`。
  - **无需改 manifest**：`host_permissions` 已是 `<all_urls>`，覆盖 `http://100.64.0.88:8088/*`（Chrome / Firefox 均可跨域取扩展页数据）。
- **验证（2026-10-28）**：本地版本 3.6.3 时行显示「已是最新（v3.6.3）」，缓存里写入的是**服务器清单里的命令原文**；离线（CDP 断网）+ 清缓存后点击 → 「检查更新失败，点此重试」，可再点重试；注入更高版本缓存 → 行变主色「有新版本 v9.9.9 · 复制更新命令」并出现「重载扩展」行，点击后剪贴板写入成功、文案变「已复制，粘贴到 PowerShell 执行」、tooltip 换成下一步提示。`npm run build` 全绿，构建产物与源逐字节一致。
- **风险 / 已知**：`chrome.runtime.reload()` 会让 popup 关闭，属预期；Firefox 侧同样只做检查（临时加载的扩展重载后仍在，但 Firefox 需要重新「临时载入」才拿到新文件——实现未区分，保持同一套文案）。
- **被 R16 / D20 取代（2026-11-05）**：popup 里的两行与 `js/update.js` 已删除；检查改在 background 定时进行，UI 在设置页「关于」，版本源改为 R15 的 `version.json`。

<a id="r15"></a>

### R15. 版本查询接口（`/res/zeroomega/version.json` + `version.txt`） — 状态：**脚本与 CI 已实现，本地模拟 /res 全场景验证通过，待生产落盘**（2026-10-28）

- **背景**：华总要求「static deploy 提供一个查询最新版本的入口，一个接口能请求到版本号就行」。此前扩展 popup 的更新检查（`js/update.js`）直接 fetch 分发包清单 `manifest.json`——那是给 portal 首页渲染卡片用的混合结构，改首页展示就会牵连版本查询。
- **第一性原理（约束推导）**：
  1. 消费方两类：扩展 popup / 人 + 脚本。人用 `curl .../version.txt` 要一行出结果；机器读 `version.json`，字段与顺序必须稳定。
  2. 唯一真源是**分发出去的那个 zip**：git tag、CI 变量、仓库版本、清单里的 version 都可能与包不一致（tag 与包版本脱钩正是要防的事故），所以版本只从 zip 内 `manifest.json` 读，脚本**不提供 `--version` 参数**。
  3. 端点要在局域网 IP / ZeroTier IP / 未来公网域名下都能用：文件里不写 host，全用相对路径，客户端自己拼。
  4. 部署是 nginx 静态目录 + 只读挂载，没有应用层写接口：所谓「接口」只能是文件，由 CI 在发版时原子落盘。
- **接口契约**：
  - `/res/zeroomega/version.json`（UTF-8 无 BOM、`ensure_ascii=False`、结尾一个换行），字段与顺序固定为：
    `package` / `version` / `built_at` / `updated_at` / `channel` / `source` / `release_notes` / `downloads.{chromium,firefox}.{url,sha256}` / `update.{command,guide}`（见 `tools/ci/write_version_endpoint.py`）。
  - `/res/zeroomega/version.txt`：一行 `vX.Y.Z\n`。
  - 字段语义：`version` 带 `v` 前缀，取 zip 内 `version` 原样加 `v`（`3.6.4-custom` → `v3.6.4-custom`，后缀不归一化）；`built_at` = 本次运行时刻（Asia/Shanghai）；`updated_at` = 该版本首次可见时间——同版本重跑沿用旧值，换版本才刷新；`downloads.*.sha256` 为包文件流式实算值；`update.command` 取分发清单里第一条带 `command` 的 link，缺失时回退成与 `js/update.js` 的 `FALLBACK_COMMAND` 完全一致的那条并告警；所有 URL 为相对路径。
- **实现（2026-10-28）**：
  - 新增 `tools/ci/write_version_endpoint.py`（仅标准库）：`read_zip_version`（zipfile 读 `manifest.json`，正则校验 `v?\d+(\.\d+)*([-+]…)?`）、`file_sha256`（1MiB 分块流式）、与 `<zip>.sha256` 记录比对、原子落盘（`mkstemp` → `chmod 0644` → `os.replace`）、`ensure_link` 幂等补 link。
  - `tools/ci/refresh_res_manifest.py`：抽出 `atomic_write`（JSON / 纯文本共用一条原子写路径）与 `refresh_index(res)`（总表汇总），供新脚本 import 复用；`main` 行为与输出不变。
  - 新脚本自己完成 `res/<id>/manifest.json` 的 link 补齐与 `/res/manifest.json` 总表刷新，**不覆盖** version / updated_at / name / description / links（只 append 缺失的版本接口 link），可重复执行。
  - `.woodpecker.yml` publish：`refresh_res_manifest.py` 之后跑 `write_version_endpoint.py --res /res --id zeroomega --notes-file CHANGELOG.md`（顺带把仓库 CHANGELOG 发布到 `release_notes` 指向的路径）。
  - `tools/ci/smoke_check.sh`：新增断言——`version.json` 可取且 `version` == 包内 manifest 版本（带 `v`）、`version.txt` 与之一致、下载 URL 指向本包。
- **校验策略（故意让 CI 失败的情形）**：包缺失 / zip 损坏 / 版本形态非法 / `--notes-file` 不存在 → 退出 1，且**不写任何文件**；sha256 与目录记录不一致 → 用实算值写入（文件内部自洽、便于排查），但打印告警并退出 2，让流水线红掉。
- **验证（2026-10-28，`/home/xl/tmp/res-sim*` 模拟 /res，未触碰 `/data/static-deploy`）**：12 组场景 56 条断言全过（正常路径字段/权限/换行、包缺失不落盘、两次幂等且保留手写 version/updated_at/name/description、`3.6.4` 与 `3.6.4-custom` 两种形态、sha 记录写错与包被误替换都退出 2、缺 command 用兜底命令、两 writer 并发 + 数百次快速读无半截 JSON、非法版本/损坏 zip/缺 notes 均拒绝、换版本刷新 updated_at、连跑两次除时间戳外一致）；`--help` 正常且无 `--version`。另用本地新构建的真实 3.6.4 包在 `/home/xl/tmp/res-sim` 跑完整流程（含生产清单拷贝、refresh → write 顺序），`smoke_check.sh` 打到本地 HTTP 服务通过。
- **已知 / 边界**：
  - 生产落盘需由验收方在发版环境执行（本次改动**未**触碰 `/data/static-deploy`，也未 push / 打 tag）。
  - 端点只描述「当前最新包」，不保留历史；回溯靠 `CHANGELOG.md` 与目录里的 `*.sha256` 记录。
  - 端点自身不带缓存头（nginx 默认）；客户端按需加 `no-store` 或查询串（现有 popup 已如此）。
  - popup 仍读分发包清单；本任务只建端点，不改扩展消费方（避免同批改动扩散）。
- **消费方已切换（2026-11-05，见 R16）**：扩展的更新检查改读 `version.json`（`update.command` / `update.guide` / `version`），不再读分发包清单。

<a id="r16"></a>

### R16. 页面规则持久化 + WebDAV 同步、更新检查移到设置页并自动化、公共后缀表更新 — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-11-05）

- **背景（华总反馈）**：① popup 底部的「检查更新」行占地方，应放到设置页，并且要能**自动**（打开浏览器时 + 定时）检查；② 核对「整个主域」场景下的切换是否有问题（要核对代码）；③ 每个网站要存自己的策略，**重开浏览器后**仍是「本页」且勾选好；④ 本页规则一起进 WebDAV，修改就上传、上传前先拉，避免冲突。
- **代码核对结论（定位）**：
  1. **公共后缀表过期（真实 bug）**：`tldjs@1.8` 自带的 `rules.json` 是 2017 年的，缺 `cc.cd`（DNSHE 免费二级域，现已在 PSL 私有段）等新私有后缀。`ai.helunox.cc.cd` 的主域被算成 `cc.cd` → 「整个主域」按钮作用到**所有** `*.cc.cd` 站点。
  2. **规则重启即失**：临时规则只写在 `chrome.storage.session`，浏览器关闭即清空；R12 记住了模式与作用域，但勾选的规则本身已不在，所以重开后「本页」是空的。
  3. **恢复时序**：session 规则的恢复挂在 `options.ready` 之后、未并入 `ready`，消息处理（`getPageInfo`）可能早于恢复执行。
  4. **表达缺口**：主域视图里，若本子域另有自己的规则在生效，副标题仍说「跟随全局 / 本页使用 <主域规则>」；全局视图看不到本子域自己的规则；中间层子域或旧 key（如残留的 `cc.cd` 规则）完全不可见、也删不掉。
- **已确认决策（D19 / D20）**：见决策日志。要点——页面规则改存扩展自身持久状态区（不进 options，不进整体备份），WebDAV 单独一个小文件按站点三方合并 + `If-Match` 防覆盖；更新检查移到 background 定时 + 系统通知，UI 在设置页「关于」；仓库内置最新公共后缀表。
- **实现（2026-11-05）**：
  - 公共后缀：新增 `omega-pac/src/public_suffix_rules.json`（publicsuffix.org 全表，tldjs 格式，1447 个 TLD）与 `tools/update_public_suffix.js`（刷新脚本）；`omega-pac/src/utils.coffee` 直接用 `tldjs/lib/domain.js` / `subdomain.js` + 新表（不再 `require('tldjs')`，避免把旧表也打进包）；`test/utils.coffee` 补 `ai.helunox.cc.cd → helunox.cc.cd`、`a.b.github.io → b.github.io`。
  - `omega-target/src/options.coffee`：抽出 `_createTempProfile` / `_newTempRule`；新增 `exportTempRules()`（`{domain: profileName}`）、`replaceTempRules(rules)`（一次 PAC 更新整体替换，丢弃 profile 已不存在的规则；没有规则时不创建 temp profile，避免把固定代理无故切成 PAC）、`matchTempRule(host)`（按 PAC 的首条命中顺序返回实际生效的规则及其 key）；`test/temp_rules.coffee` 新增 4 例（往返、丢弃失效 profile、整体替换、实际命中）。
  - `omega-target-chromium-extension/src/module/options.coffee`：规则存 `state.tempRules`（`omega.local.*`，经 idb-keyval 持久），在 `ready` 内恢复；兼容读取 3.6.4 及之前写在 `chrome.storage.session` 的旧规则（一次性迁移）；`addTempRule` / `replaceTempRules` 写盘后回调 `onTempRulesChanged`（同步拉取导致的替换不回调）；`getPageInfo` 新增 `tempRuleMatch`（仅 `_tempProfileActive` 时给，系统代理为全局时不误报）。
  - `options_backup.coffee`：WebDAV 新增 `zeroomega/zeroomega-temprules.json`（`{rules, updatedAt}`）的 `getTempRules` / `putTempRules`（强 ETag 时带 `If-Match`，412 视为冲突重试，最多 3 轮）；`syncTempRules`（串行、期间有新改动则再跑一轮）：拉取 → 与 `state.tempRulesBase` 三方合并（`mergeTempRules`，按站点：只本机改过取本机，只远端改过取远端，两边都改本机这次点击优先；首次同步 = 远端 + 本机叠加）→ 不同则上传 → 记 base；触发：规则变化 1s 防抖、background 启动后一次、`omega.tempRulesPull` 闹钟每 10 分钟、保存 WebDAV 设置时；新配置项 `optionsBackup.syncTempRules`（默认开）及上次同步时间 / 状态。
  - 更新检查：新增 `module/update_check.coffee`——读 `version.json`（R15 端点，相对 URL 补 host），结果存 `state.update.*`；`omega.updateCheck` 闹钟每 6h（只在缺失时创建，避免 worker 重启把计时清零）+ worker 启动时若距上次检查 >30 分钟再查一次；发现新版本弹 `chrome.notifications`（**每个版本只弹一次**），点击打开 `options.html#!/about`。manifest（Chrome / Firefox）新增 `notifications` 权限。
  - 设置页：`partials/about.jade` + `controllers/about.coffee` 新增「更新」分组（状态、三步说明、命令原文、复制 / 重载扩展 / 立即检查，未检查过则进入页面时自动查一次）；`partials/io.jade` + `controllers/io.coffee` 新增「同步页面规则」开关与上次同步时间 / 状态；`less/options.less` 补 `.update-command` / `.update-steps`。
  - popup：删除 `js/update.js` 与底部两行及其 CSS；`profiles.js` 改用 `tempRuleMatch`——副标题始终写本页实际路由；提示行覆盖「受更宽规则覆盖」（`popup_domainOverride`）与「本子域另有自己的规则」（新 `popup_hostOverride`），各带显式「撤销」，因此旧 key / 中间层规则也能看见、能删；首次打开（无存档模式）时只要本页被某条临时规则路由就落在「本页」，所以从别的设备同步来的站点也直接显示勾选；去掉 `OmegaPopup.pageRoute` / `pageRouteFromInfo` / `inheritedRule` / `effectivePageRule`。
  - i18n（`en_US` + `zh_CN`）：新增 `popup_hostOverride`、`options_backupSyncTempRules*`、`options_backupTempRulesLast`、`options_group_update`、`options_update*`（11 条）、`update_notifyTitle` / `update_notifyMessage`；改写 `popup_domainOverride`（直接说「本页实际走 X」）与 `popup_tempRuleLifetime`（规则会保存、可同步）；删除 popup 更新相关 11 条。
- **验证（2026-11-05）**：
  - `npm run build` 全绿（coffeelint 全过；jade 仅 2 条既有 warning）；构建产物 `omega_pac.min.js` 含新表（`cd: gov|cc`）且不含旧表。
  - 单元测试：omega-target **10 passing / 0 failing**；omega-pac **143 passing / 1 failing**（既有 SOCKS5）；`mergeTempRules` 10 例真值表全过。
  - 端到端（临时目录 harness，不入库；真实 headless Chromium 加载 `build/`，`--host-resolver-rules` 指向本地站点，本地内存 WebDAV 服务实现 MKCOL/GET/PUT（强 ETag + `If-Match`→412）/DELETE）：
    - 同步（两个独立浏览器配置模拟两台设备，17 条全过）：cc.cd 站点作用域为 `ai.helunox.cc.cd` / `helunox.cc.cd`；A 设规则即上传；**A 真实关闭并重启浏览器后规则仍在，popup 直接「本页 + 勾选」**；B 带本地规则加入 WebDAV → 合并保留双方；B 首次打开 A 的站点即「本页 + 勾选」；A 拉到 B 的规则；两台同时改不同站点 → 合并且收敛；一端撤销 → 另一端同步删除；残留的旧 `cc.cd` 规则在本页视图有提示 + 撤销且能删掉；设置页「关于」显示更新分组，注入更高版本后显示版本、命令原文与「复制更新命令」。
    - 回归（22 条全过）：新站点默认全局；本页无规则「跟随全局」；再点已生效行规则不变；改选替换；「撤销本页规则」只删这一条；主域作用域写主域 key、「撤销主域规则」；切作用域不搬规则；子域继承主域规则（勾选 + 提示、无自身撤销）；子域另有规则时主域视图副标题写实际路由并提示子域规则；全局视图列表标全局、提示写本页实际路由；切全局不删规则；兄弟子域按自身记忆；**重启浏览器后两条规则仍在且 PAC 含两条**；系统代理为全局时回落全局、不误报临时规则、规则保留，切回 auto switch 后本页路由恢复。
- **已知 / 边界**：
  - 页面规则与整体 options 备份是**两个文件**：「从备份恢复」不会改动页面规则，反之亦然。
  - 两台设备几乎同时改**同一个站点**时，后上传的那台的选择为准（`If-Match` 保证不会丢掉对方对其它站点的修改）；服务器不支持强 ETag 时退化为「先拉后推」，竞争窗口约为一次 GET→PUT 往返。
  - 首次同步时远端与本机对同一站点值不同，以本机为准。
  - Firefox 未单独实测（同一份代码；`notifications`、`alarms` 均为 WebExtensions 标准 API）。

<a id="r17"></a>

### R17. 后台按 tabId 的调用兜住「标签已关闭」竞态 — 状态：**已实现，构建通过，待实机确认**（2026-11-09）

- **背景**：chrome://extensions 的「错误」里出现 `Uncaught (in promise) Error: No tab with id: <id>`。MV3 下 `chrome.*` API 返回 Promise；调用发出的瞬间该 id 的标签页已被关闭（或被替换）时 Promise 被 reject，而代码没有接住，浏览器就记为未处理的 Promise rejection。它只是控制台噪音，路由 / PAC / 临时规则都不受影响。
- **触发点（service worker 侧，全部是按 tabId 的调用）**：
  - `module/tabs.coffee`：`processTab` 中带 `tabId` 的 `chrome.action.setTitle` / `setBadgeText`（chrome:// 页面分支、清空角标、写入角标文本）与 `setTabBadge` 的 `setBadgeText` / `setBadgeBackgroundColor`；
  - `coffee/background.coffee`：`refreshActivePageIfEnabled` 的 `chrome.tabs.update` / `chrome.tabs.reload`（默认 `-refreshOnProfileChange: true`，每次切情景模式都会刷新当前页）与 inspect 流程的 `chrome.action.setTitle`；顺带补了 `tabs.length == 0` 保护（原来会抛 `Cannot read properties of undefined`）。
- **实现**：这些调用改为回调式并读取 `chrome.runtime.lastError`（`tabs.coffee` 复用既有 `ignoreError`，`background.coffee` 新增 `ignoreTabError`）。行为不变——标签已经不存在时本来也没有需要更新的 UI。
- **未改（同类但属于扩展页面，不在本次报告的 service worker 控制台）**：`omega_target_web.coffee` 的 `refreshActivePage`、`popup/network/js/tab.js` 的刷新 / 切换按钮、`popup/network/js/index.js` 的 `autoDiscardable` 调用；它们会在各自页面控制台报同类错误，可按需一并兜底。
- **验证（2026-11-09）**：`omega-target-chromium-extension` 的 `grunt` 全绿（coffeelint 28 files lint free）；构建产物已确认把回调编进 `build/js/background.js` 与 `build/js/omega_target_chromium_extension.min.js`。

<a id="r18"></a>

### R18. popup 收敛为「一址一规则」：模式即路由，去掉作用域与撤销按钮 — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-11-09）

- **背景**：华总指出「撤销本页规则 / 撤销主域规则」与「全局 / 本页」并存很绕。他的模型是：一个站点要么用全局、要么用本页；本页永远有勾选（默认当前全局情景模式，如 auto switch；有记录用记录）；切换会存储；不需要显式的“撤销规则”。代码审计同时确认了旧模型里“模式只是视图、规则仍在生效”的根源。
- **已确认决策（D22）**：
  - 本页规则只按**当前主机**（完整 hostname）写，去掉「子域 / 主域」作用域与分段控件。
  - **模式即路由**：切到本页 = 为该 host 写入一条规则（该 host 上次选中的 profile；没有记录则用当前全局 profile）；切到全局 = 删除该 host 的规则。
  - 列表行点击只改写这一条 host 规则；再次点击已生效项幂等；点击永不删除。
  - 撤销按钮移除（本页/主域都不再有）。只有「更宽的主域规则」提示行保留一个显式撤销：旧的整域规则不归 popup 管，删它会改变同域其它站点。
  - 默认勾选**当前全局情景模式**（不硬编码 auto switch）；全局为 SystemProfile / 外部接管 / 不可包含时本页不可用（胶囊隐藏）。
  - 上次选择按 host 记在 `localStorage`（`omega.popup.pageProfile:<host>`）；切回全局只删规则、不清记忆。模式不再单独存偏好——**有规则 = 本页，无规则 = 全局**，规则本身是状态。
  - 受更宽规则覆盖时（本 host 没有自己的规则），popup 仍显示「全局」+ 提示行；此时切到本页会写一条 host 规则覆盖它（只影响本 host）。
- **实现（2026-11-09）**：
  - `omega-web/src/popup/index.html`：删除 `#js-scope` 与 `#js-clear-rule`。
  - `omega-web/src/popup/js/profiles.js`：移除 `pageScopes` / `pageScope` / 作用域恢复 / 分段控件 / 撤销逻辑；新增 `hostRule()`、`defaultPageProfile()`（记忆 → 当前全局）、`refreshPageInfo()`（写/删后向 background 取一次实际路由，校正更宽规则提示）；`setMode()` 负责写入/删除 host 规则；`applyPageProfile()` 只写 host；`renderPageSection()` 由规则存在性决定模式；`otherRule()` 只报告更宽规则。
  - `omega-web/src/popup/css/index.css`：删除 `.om-scope` / `.om-segmented*` / `.om-section-action` 死样式。
  - `omega-web/src/popup/js/index.js`：仅更新注释。
  - i18n（`en_US` + `zh_CN`）：改写 `popup_modeHelp`；删 `popup_tempRuleScope`、`popup_pageFollowGlobal`、`popup_clearPageRule`、`popup_clearDomainRule`、`popup_hostOverride`。
- **取代**：R10 的「子域 / 主域分段」、R13 / D16 的显式撤销、D15 的「模式作为视图偏好」。D14 的「一次点击只碰当前站点这一条」仍成立且更强（popup 只写 host key）。
- **验证（2026-11-09）**：`omega-web` 与扩展模块 `grunt` 全绿；真实 Chromium 端到端（临时目录 harness，不入库）22 条断言全过：新建站点默认全局；切本页写入 host 规则（默认 auto switch）；改选替换同一条；切全局删除；切回本页恢复上次选择；另一站点独立；单层域名（host === domain）正常；重启后规则 / PAC / 本页勾选保留；旧的整域规则只在提示行显示、不伪装成本页规则；切本页写 host 规则覆盖它、切全局只删这一条；系统代理为全局时本页控件隐藏且规则保留。
- **已知限制**：旧的整域规则在「全局」视图下只能通过提示行撤销；popup 不再创建整域规则（临时规则管理页目前只能删、不能建）。

<a id="r19"></a>

### R19. 页面规则与情景模式改名 / 删除不一致 — 状态：**已修复**（2026-11-09）

- **现象**：`renameProfile` / `replaceRef` 会更新其它 profile 内的引用与 `-startupProfileName`，但**不更新页面规则**（`_tempProfile.rules` / `_tempProfileRulesByProfile`）。
  - 改名后，下一次 `applyProfile` 的清理会把引用旧名字的规则静默移除；重启时 `replaceTempRules` 会过滤掉不存在的 profile 并保存，规则**永久消失**。
  - 删除 profile 时同理：规则可能悬空到下一次 PAC 重建，随后 `_profileNotFound` 把它映射成 `VirtualProfile → direct`。
- **复现（真实 Chromium harness）**：设置 `postest.findfine.com → proxy` 后调用 `renameProfile('proxy', 'proxy2')`，`getTempRules()` 变成 `{}`，popup 显示「本页 · 跟随全局」；点一下新 profile 才恢复。
- **实现（2026-11-09）**：
  - `omega-target/src/options.coffee`：`_replaceRefChanges()` 同步改写 temp rules 的 `profileName`、迁移 `_tempProfileRulesByProfile` 的键并更新 revision；抽出 `_pruneTempRules()` 统一清理引用已不存在 profile 的规则，`applyProfile()` 与 `_setOptions()`（profilesChanged 时）都会调用；新增 `_tempRulesChanged()` 空钩子供 target 持久化。
  - `omega-target-chromium-extension/src/module/options.coffee`：`_tempRulesChanged` 覆盖为 `_saveTempRules()`（落盘 + 触发 WebDAV 同步）。
  - `omega-target/test/temp_rules.coffee`：新增 3 例（改名跟随、替换引用跟随、删除时清理并上报）。
- **验证（2026-11-09）**：`omega-target` 13 passing / 0 failing；`omega-pac` 143 passing / 1 failing（既有 SOCKS5）；真实 Chromium 端到端 harness 全过：改名后规则与 popup 都指向新名字、重启后仍是新名字；删除 profile 后规则立即消失、popup 回到全局、重启后不会复活；`probe6`（R18）与重启/图标回归用例无回归。

<a id="r20"></a>

### R20. 切换不改变实际路由时不再刷新页面；本页写入改为显式意图 — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-11-11）

- **背景（华总反馈）**：①「全局 / 本页切换时，如果具体规则模式没有发生变化，页面不应该刷新；现在同一个情景模式切换也会刷新页面，体验很差」；②「本页切换似乎没有效果，页面刷新但请求没有达到我指定的」（截图：`postest.findfine.com` 显示「本页使用 FIDDLER」且 FIDDLER 已勾选，但请求没走 FIDDLER）。
- **代码核对 / 复现（真实 Chromium + 本地 HTTP 代理 + service worker 插桩，临时目录 harness 不入库）**：
  1. `omega_target_popup.js` 的 `callBackgroundNoReply` 对 `applyProfile` / `setDefaultProfile` / `addTempRule` **一律**带 `refreshActivePage: true`；background 的 `refreshActivePageIfEnabled` 在方法完成后无条件 `chrome.tabs.reload(bypassCache)`。实测同一情景模式 全局→本页（PAC 结果都是 `DIRECT`）刷新 1 次，本页→全局再刷新 1 次。
  2. popup 的 `writePageRoute()` 用 **toggle 语义**调用 `addTempRule(host, profile)`，靠本地 `pageInfo.tempRuleHostProfileName` 判断「是否已生效」才跳过。该缓存可能滞后于 background（刷新竞态、WebDAV 拉取、重启恢复等）：缓存为空而后台已有同一 profile 的规则时，toggle 会把它**删除**；popup 却乐观地显示「本页使用 FIDDLER」。这正是截图与「请求没达到指定 profile」的成因。
- **已确认决策（D23）**：见决策日志。要点：**只有活动页的实际代理结果变化才刷新**；popup 写入改为显式意图（force set / force delete），不再依赖可能过期的本地视图做 toggle。
- **实现（2026-11-11）**：
  - `omega-target/src/options.coffee`：
    - `addTempRule` 的 `toggle` 新增 **`2` = force set**（缺则加、不同则改、同则不删、绝不删除）；`-1` 改为不依赖传入 `profileName` 的强制删除（原来传入过期名字会走到「改 profile」分支，只改名不删）；`1` 仍为「有则不动」的 force add。顺带修掉：`_pruneTempRules` 留下的 `profileName = null` 悬空条目现在视为不存在，避免重复插入第二份 rule 对象；删除时的 `_tempProfileRulesByProfile` 记账改用 rule 真实指向的 profile。
    - 抽出同步的 `matchProfileSync(request)`，`matchProfile` 改为包装它（行为不变），供后台在同一 tick 内比较路由。
  - `omega-web/src/popup/js/profiles.js`：`writePageRoute()` 去掉「靠缓存判断是否跳过」的逻辑，一律 `addTempRule(host, profileName, 2)`；`index.js` 的 `clearTempRule` 保持 `-1`。
  - `omega-target-chromium-extension/src/js/omega_target_popup.js`：`callBackgroundNoReply` 附带 `activeTabUrl`（取自 `OmegaPopup.pageInfo.url`），让后台不必在改规则前多做一次异步 `chrome.tabs.query`（那会打乱消息顺序）。
  - `omega-target-chromium-extension/src/coffee/background.coffee`：新增同步 `routeResult(url)`（`matchProfileSync` 取链路末端结果，把 `direct`/`+direct` 归一为 `DIRECT`、`system`/`+system` 归一为 `SYSTEM`）；消息处理在方法执行**前**同步捕获 `before`，方法完成后 `refreshActivePageIfEnabled(before, url)` 再算 `after`，**仅当二者都有且不同**才刷新；任一侧未知、或 popup 传入的 URL 与活动 tab 已不一致时按旧行为刷新（保守）。
  - `omega-target/test/temp_rules.coffee`：新增 3 例（force set 不删除、force delete 不受传入名字影响、force add 不覆盖已有规则）。
- **验证（2026-11-11）**：
  - 单元测试：`omega-target` **16 passing / 0 failing**；`omega-pac` **143 passing / 1 failing**（既有 SOCKS5，与本次无关）；`npm run build` 全绿（coffeelint 全过）；构建产物已核对含 `routeResult` / `matchProfileSync` / `activeTabUrl` / force-set。
  - 真实 Chromium 端到端（service worker 插桩计 `chrome.tabs.reload`、活动 tab 指向站点、FIDDLER 为真实本地 HTTP 代理）：
    - 全局→本页（同一 auto switch）**0 次刷新**；本页→全局 **0 次**；来回切换 **0 次**；点已生效的 FIDDLER **0 次**；重复选当前全局 profile **0 次**；本页 `direct`→全局 `auto switch`（实际都是 DIRECT）**0 次**。
    - 真正改变路由时仍刷新：**本页选 FIDDLER / 改选 direct 各 1 次**，且刷新后的请求确实到达 FIDDLER 代理（`proxyHits` 有记录，PAC `FindProxyForURL` 返回 `PROXY 127.0.0.1:8899`）。
    - 复现截图场景：手工把 popup 的 `pageInfo` 改成过期（清空 host 规则）后再点已勾选的 FIDDLER，规则仍在、PAC 仍走 FIDDLER、不产生重复规则；过期状态下切回全局仍真的删除规则。
    - 回归：`probe6`（R18）22 条全过；WebDAV 双设备同步（推送 / 合并 / 重启 / 收敛 / 撤销传播 / 设置页更新分组）全过；`omega_target_popup.js` 与构建产物逐字节一致。
- **未改（独立路径）**：Angular 版 `popup.coffee` / `omega_target_web.coffee` 有自己的 `omegaTarget.refreshActivePage()`（用于「添加条件 / 请求信息」表单），不走 `refreshActivePage` 消息标志；主菜单用的是原生 JS popup，本次以其为范围。
- **已知边界**：`routeResult` 比较的是链路末端结果，不是整段链路；若两个不同配置的中间跳数最终落到同一代理，也按「未变化」不刷新（符合用户诉求：实际路由没变就不该打断页面）。

<a id="r21"></a>

### R21. 仓库根 `favicon.svg`（供 OpenChamber 等项目列表识别图标） — 状态：**已完成并提交**（2026-11-12）

- **背景**：OpenChamber 的项目图标只在仓库里找文件名恰为 `favicon.{ico,png,svg,jpg,jpeg,webp}` 的文件（路径越短越优先），本仓库没有任何 `favicon*`，所以一直显示通用文件夹图标。这与扩展自身在 `omega-web/img/icons/` 里的图标无关。
- **实现（2026-11-12）**：新增仓库根 `favicon.svg`——品牌蓝 `#31afec` 圆角方块 + 白色 omega 标（复用 `omega-web/img/icons/omega-128.svg` 的 path，内缩 70%、圆角 22%）。同时删掉原 SVG 里的 DOCTYPE、`t` / `p-id` 图标字体残留属性。
- **为什么用「蓝底白标」而不是「裸标」**：裸标（蓝 omega 透明底）在浅色背景上只是一圈细线、在深色背景上蓝线对比偏低；反色瓷砖在浅 / 深两种界面下外观一致，16px 下轮廓最稳（本地以 16/32/48/96/256 与圆形裁切逐档截图核对）。
- **验证（2026-11-12）**：本地 HTTP 预览页直接引用该文件，逐档尺寸在白色 / `#1b1c1f` 深色背景下渲染正常，`<link rel="icon" type="image/svg+xml">` 亦能取到；文件 654 字节、纯静态，不影响构建。
- **注意**：该文件只服务项目列表 / 文档场景，**不参与**扩展打包（`omega-build` 只拷各模块产出）；扩展图标仍在 `omega-web/img/icons/`，改动那边的图标不要忘了这里。

<a id="r22"></a>

### R22. 页面规则多设备感知提速（条件轮询 + 事件补拉） — 状态：**构建与逻辑校验通过，待实机确认**（2026-11-13）

- **背景**：R16 之后，A 设备改动约 1 秒上传，但 B 设备最坏要等 **10 分钟**（`omega.tempRulesPull` 闹钟）才拉到。华总问「有没有推送还是只能轮询」，并明确**只用 WebDAV、服务端是 dufs**；顺带要求对比 `yetone/magpie` 与 FlClash 的做法。
- **调研结论（三者都没有推送）**：
  - `dufs` 是「静态文件服务器 + WebDAV 方法」，支持强 ETag（`etag_from_metadata`，基于纳秒 mtime / size / inode，不读内容）、`If-None-Match` → **304**（GET/HEAD）、`If-Modified-Since` → 304、`If-Match` → 412、`PROPFIND` 的 `D:getetag`；**不支持** WebDAV `sync-collection`(RFC 6578)、SSE、WebSocket、长轮询或任何变更通知。
  - `yetone/magpie`：也是轮询——默认 **3 分钟**（`davsync.go` 的 `Every`）、可配更长 / 仅手动、保存设置立即同步；关键是 GET 带 `If-None-Match`，304 时零传输（`errNotModified`），PUT 带 `If-Match`，412 重试合并；还有 `NoCondRead` 降级（某些服务器对条件 GET 回 500）、`Accept-Encoding: identity` 防 ETag 被压成弱 ETag、文件锁与失败退避。
  - `chen08209/FlClash`：`DAVTransport` 只有 OPTIONS/MKCOL/PUT/GET（Basic/Digest），`DAVClient` 只有 ping/upload/download，UI 只有「备份 / 恢复」两个按钮；**没有定时、没有 ETag、没有自动拉取、没有合并**，是整包覆盖的纯手动备份，比本 fork 现状还弱。issue #2479 提的「按时间戳命名 + 历史列表」仍是手动选。
- **已确认决策（D25）**：见决策日志。要点：不引入 dufs 之外的组件，把「缩短周期」与「让每轮几乎免费」结合，再叠加事件触发补拉。
- **实现（2026-11-13）**：
  - `omega-target-chromium-extension/src/module/options_backup.coffee`：
    - `TEMP_RULES_PULL_MINUTES` 10 → **0.5**（Chrome 120+ / Firefox 下限 30 秒）；闹钟改名 `omega.tempRulesPullV2` 并清掉旧的 `omega.tempRulesPull`——同名 `create` 不会改周期，否则升级后仍是 10 分钟；
    - `WebDavClient.getTempRules(etag)` 带 `If-None-Match`（弱 ETag 不发），处理 **304 → `unchanged: true`**；
    - `_syncTempRulesOnce` 在 304 时用 `state.tempRulesBase` 作为远端值（每次成功同步后 base 恒等于远端），200 时把响应 ETag 存内存 `@_tempRulesEtag`；base 缺失时清 ETag 重读一次；PUT 仍带 `If-Match`（304 时用旧 ETag、200 时用新 ETag，都对应当前文件）；
    - `syncTempRules(force)`：失败按指数退避（30s→…→5min，成功清零），闹钟与事件补拉尊重退避；本地改动、保存设置、手动同步、启动拉取传 `force=true` 穿透；`pullIfStale()` 在 30 秒内有任何同步就跳过，避免与闹钟撞车。
  - `src/coffee/background.coffee`：`syncTempRulesNow` 改 force；新增 `options.pullTempRulesIfStale`；`chrome.windows.onFocusChanged` 触发补拉（跳过 `WINDOW_ID_NONE`）。
  - popup：`src/js/omega_target_popup.js` 新增 `pullTempRules` → 后台 `pullTempRulesIfStale`；`omega-web/src/popup/js/loader.js` 打开时异步补拉（**不阻塞首屏**，等 `om-main/om-state/om-page-info` 就绪后再刷新）；`profiles.js` 暴露 `refreshPageInfo`（复用 `pageInfoToken` 防竞态，只重取 pageInfo 重画页卡片）。
- **语义不变**：仍只有页面规则自动同步；整体 options 备份仍是「只上传 + 手动恢复」（R7/D9）；路由语义、manifest、i18n、依赖均未改动。
- **最坏延迟**：30 秒（闹钟；Chrome <120 会被 clamp 到 1 分钟）+ 用户主动触发点（开 popup / 切窗口）。无变化时每轮只有一个空 304，不传 JSON、不写 options。
- **验证（2026-11-13）**：
  - `npm run build` 全绿（coffeelint 28 files lint free；jade 仅 2 条既有 warning）；构建产物含 `If-None-Match` / `omega.tempRulesPullV2` / `pullIfStale`，popup 的 `loader.js` / `profiles.js` 与源逐字节一致。
  - 单元测试：omega-target **16 passing / 0 failing**；omega-pac **143 passing / 1 failing**（既有 SOCKS5，与本次无关）。
  - 逻辑校验台（临时目录，不入库：直接编译 `options_backup.coffee`，桩模拟 dufs 的 ETag / 304 / 412）**10 条断言全过**：首次同步上传、200 记 ETag 与 base、304 零传输、远端变更合并下来、本地改动在 304 下仍能推送（If-Match）、412 冲突重拉合并、失败退避与 force 穿透、事件补拉节流、弱 ETag 不发条件头、旧闹钟迁移到 30 秒。
- **待实机**：重载扩展后确认 30 秒闹钟建立、popup 打开 / 切窗口的补拉、设置页「上次同步」时间刷新，以及真实 dufs 返回 304（可先用 `curl -H "If-None-Match: <ETag>"` 验证服务端）。
- **相关代码**：`omega-target-chromium-extension/src/module/options_backup.coffee`（`getTempRules` / `syncTempRules` / `pullIfStale` / `_syncTempRulesOnce` / `watch`）、`src/coffee/background.coffee`、`src/js/omega_target_popup.js`、`omega-web/src/popup/js/loader.js` 与 `profiles.js`。

<a id="r23"></a>

### R23. WebDAV 备份保留最近 3 个版本（含一次「备份变默认配置」事故复盘） — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-11-15）

- **事故现象**：华总从 WebDAV 恢复后发现内容缺失（只有 `+auto switch` / `+proxy` 两个情景模式、设置全默认）。
- **核对结论（先分清是谁的错）**：
  - **服务器上的备份本身就是坏的那份**：live dufs（`http://100.64.0.88:13306`，`zeroomega/zeroomega-<id>.json`，1727 B，mtime `2026-11-15 03:25:27 GMT` = 11:25 +08）的内容与全新安装默认 options 逐项一致（只多一个 `-monitorWebRequests: true`）。
  - **恢复是忠实的**：用真实构建产物把该文件恢复到干净设备，结果与服务器内容一致（仅 `revision` 不同）；PROPFIND 显示目录里只剩这一份选项文件——上一份好备份已被旧逻辑的「单槽」DELETE 掉，所以没有退路。
  - **来源**：Edge（`flppdejfgfipjjmgmdbfdfihighnjegl`）本地仍持有好配置（FIDDLER / VPN / auto switch / direct / system，`lastBackup` 有值但 `lastBackupState = fail: Failed to fetch`、`lastBackupCommit` 从未写入 → Edge 从未成功上传过）；Chrome / Firefox 侧无任何 WebDAV 配置 → 覆盖来自另一台机器 / 另一份安装。
  - 另有已复现的次生风险：恢复到「缺少页面规则所引用 profile」的 options 时，`_pruneTempRules` 会静默删掉本机页面规则并把删除同步到 WebDAV（本次未改，见 D26 的「未做」）。
- **已确认决策（D26）**：服务器改为**保留最近 3 个选项文件**（`BACKUP_VERSIONS = 3`），上传成功后按 `getlastmodified` 从新到旧裁剪；设置页新增「备份版本」下拉 + 刷新按钮，恢复时用选中的那一份（不选 = commit 文件指向的最新）。
- **实现（2026-11-15）**：
  - `omega-target-chromium-extension/src/module/options_backup.coffee`：
    - 新增 `davElements(tag, xml)`（DAV 响应里取同名元素的内部文本，命名空间前缀可选——dufs 用 `D:`，别的服务器用默认命名空间）；
    - `WebDavClient.pushOptions(options)` 去掉 `previousCommitId` 参数，上传 + 写 commit 后调 `_pruneOptions(newCommitId)`；
    - 新增 `listOptions()`（`PROPFIND Depth: 1`，解析 `href` / `getlastmodified`，按 mtime 新到旧排序；**没有可用 mtime 的文件不进排序、也永不删除**）与 `_pruneOptions(newCommitId)`（保留新文件 + 最近 `BACKUP_VERSIONS - 1` 个；DELETE 失败忽略）；
    - 列目录失败（服务器不支持 PROPFIND）时**跳过裁剪**：只多留文件，绝不删错；
    - 新增 `OptionsBackup.listBackups()`（返回 `{commitId, lastModified, latest}`，`latest` = commit 文件指向的那份）；`restore(commitId)` 支持指定版本，id 先过 `/^[0-9a-zA-Z]+$/` 白名单，不传则仍读 commit 文件。
  - `src/coffee/background.coffee`：`options.listOptionsBackups`、`options.restoreOptionsFromBackup(commitId)`。
  - `src/coffee/omega_target_web.coffee`：`listOptionsBackups`、`restoreOptionsFromBackup(commitId)` 透传。
  - `omega-web/src/partials/io.jade` + `controllers/io.coffee`：备份设置区新增「备份版本」下拉（日期 + 「· 最新」）与刷新按钮；`backupNow` 成功后刷新并把选择切到新的最新；恢复用所选版本；无 PROPFIND 时下拉给出「读取备份列表失败，恢复将使用最新的一份」，恢复本身仍可用。
  - i18n（`en_US` + `zh_CN`）：新增 `options_backupVersion` / `options_backupVersionLatest` / `options_backupVersionHelp` / `options_backupVersionRefresh` / `options_backupVersionFailed` / `options_backupVersionNone`；顺手修正 `options_backupSyncTempRulesHelp` 里过期的「每 10 分钟」→「每 30 秒」（R22 已改代码只改了代码）。
- **实现要点（Angular，勿回退）**：
  - 下拉**绑下标**（`backupVersionIndex`）而不是 commitId：`ng-options` 在「上一次的选项表」上渲染模型，若列表与模型在同一个 digest 里同时变化、且旧选中值已不在新表里，模型会被 Angular 丢成 `null`（实测复现；`$evalAsync` / `$applyAsync` 补救无效）。
  - 版本行用 **`ng-show` 而不是 `ng-if`**：`ng-if` 会新建子作用域，`ng-model` 写到子作用域，而 `versionPicked()` / `loadBackupVersions()` 读的是 controller 自己的 `$scope`，两边会不一致（实测踩到）。
- **验证（2026-11-15）**：
  - `npm run build` 全绿（coffeelint 全过；jade 仅 2 条既有 warning）；`build/js/omega.js` 无调试残留，`build/partials/io.html` 与 `_locales` 均为新内容。
  - 单元测试：omega-target **16 passing / 0 failing**。
  - 真实 Chromium + 构建产物 + 内存 WebDAV（新写 `dav2.js`，带 PROPFIND / 强 ETag / 每次写入递增 mtime；harness 在临时目录，不入库）：
    - `history.js` **24 条断言全过**：连续 4 次备份只留 3 个文件、最旧的被裁剪、commit 指向最新、列表 3 条且新到旧、只有一条标 `latest`、恢复第 2 新的版本内容正确、不指定版本恢复最新、非法 id 被拒、**无 PROPFIND 的服务器不删任何文件**且列表报错但恢复仍可用。
    - `ui_check.js` **11 条断言全过**：设置页下拉列出 3 个版本并默认选中最新、只有最新带「· 最新」、改选旧版本后模型/下拉一致、刷新保留选择、页面上点「立即备份」后裁剪到 3 并把选择切到新的最新、无未知选项残留；截图逐项核对（下拉 + 刷新按钮 + 帮助文案）。
- **待实机**：**先用 Edge 打开设置页 → WebDAV → 「立即备份」把好配置推上去**（当前服务器上那份是坏的）；重载扩展后确认下拉 / 恢复链路（`_locales` 需重载才生效）。
- **已知 / 边界**：仍没有服务端锁——两台设备几乎同时上传时，两边都按各自看到的列表裁剪，极端情况下可能多删一份（保留 3 份的窗口内影响很小）；「恢复到缺少 profile 的 options 会清掉引用它的页面规则」本次未处理。

<a id="r24"></a>

### R24. WebDAV 首次连接只读不上传（默认配置不再覆盖服务器备份） — 状态：**构建通过，真实 Chromium 端到端校验通过，待实机确认**（2026-11-15）

- **背景（华总提出）**：「首次配置应该先从服务上拉取，而不是拿本地的去推送覆盖吧？」核对代码确认：保存 WebDAV 设置本身不推送（`setConfig` 只同步页面规则），但 `_autoBackup` 只看 `autoBackup` + `uri`，**完全不看服务器上有没有东西**——R23 事故里那台机器就是「默认配置 + 自动备份」，一次选项改动（`-monitorWebRequests: true`）就把默认配置推成了最新。页面规则早就是「先拉取 → 三方合并 → 再推送」，成套配置这条路没有同等保护。
- **已确认决策（D27）**：**首次连接不推送**。本机从未与该 URI 成功同步过（`syncedUri != uri`）时，自动备份一律先读服务器：有备份 → 记下 `adoptPending`、暂停自动上传，设置页提示并由用户选择「从备份恢复」或「立即备份」；服务器为空 → 本次上传即基线，自动备份照常。恢复成功与显式「立即备份」都记录基线（`syncedUri`）并清掉提示。
- **不做「自动从服务器恢复」的原因**：事故场景里服务器那份是坏配置、Edge 本机那份是好的；自动拉取会把本机好配置也毁掉，反向同样危险。提示 + 两条出口对两个方向都安全。
- **实现（2026-11-15）**：
  - `omega-target-chromium-extension/src/module/options_backup.coffee`：新增 state 键 `optionsBackup.syncedUri`（与哪个 URI 已同步过）、`optionsBackup.adoptPending`（等待用户决定的 URI）；新增 `_uriOf` / `_canPush` / `_markSynced`；`_autoBackup` 先过 `_canPush`；`setConfig` 保存后立即探测（提示不必等下一次选项改动）；`backupNow` / `restore` 成功后 `_markSynced(uri)`。
  - `_canPush` 语义：`syncedUri == uri` → 允许；`adoptPending == uri` → 拒绝（不重复请求服务器）；否则读 commit 文件——有备份 → 记 `adoptPending` 并拒绝，无备份 → 记 `syncedUri` 并允许。
  - `omega-web/src/omega/controllers/io.coffee`：读 `optionsBackup.adoptPending`；`adoptPendingFor(uri)` 与输入框里的地址比较（改了地址就不该再挂着旧提示）；`saveBackupConfig` / `backupNow` 成功后刷新提示状态；`partials/io.jade` 在版本行与按钮之间加 `.alert.alert-warning` 提示。
  - i18n（`en_US` + `zh_CN`）：新增 `options_backupAdoptTitle` / `options_backupAdoptHelp`。
- **验证（2026-11-15）**：
  - `npm run build` 全绿（coffeelint 全过；jade 仅 2 条既有 warning）；omega-target **16 passing / 0 failing**。
  - 真实 Chromium + 构建产物 + 内存 WebDAV（临时 harness `firstsync.js`，22 条断言全过）：服务器已有备份时首次配置**不产生任何上传**、commit 不动、`adoptPending` 写入；本地改动 + 自动备份开着也不推；设置页出现提示（截图核对位置与文案）；改连空服务器后提示消失、首次上传成为基线、自动备份正常；切回有备份的服务器再次挂起，页面上点「立即备份」后上传成功、提示消失、随后自动备份恢复；清空 `syncedUri` 模拟新设备 → 再次挂起、本地改动不外泄，「从备份恢复」后本机等于服务器副本、提示清空且没有额外上传。
  - 回归：`history.js`（24 条）、`ui_check.js`（11 条）、`probe6.js`（popup 规则 22 条）全过。
- **待实机**：重载扩展后确认首次连接提示与两条出口（`_locales` 需重载才生效）。
- **已知 / 边界**：`adoptPending` 期间自动备份暂停，只有设置页提示说明原因；`syncedUri` 为空且探测失败（网络 / 认证错误）时按旧行为允许推送（此时推送同样会失败），未做离线闸门。

<a id="r25"></a>

### R25. popup 去掉「全局 / 本页」切换：一址一「当前」规则 + 选项里的「默认」 — 状态：**构建与浏览器校验通过，待实机确认**（2026-11-17）

- **背景（华总反馈）**：① 整域规则提示「本页实际走 … 来自 findfine.com 下所有站点共用的临时规则」不该再出现；② 在「本页」点击已勾选的情景会擅自跳回「全局」，期望是按当前情景刷新；③ 截图指出顶部「站点名 + 本页/全局切换 + 副标题」整块区域已无必要；④「点击 auto switch 似乎无效」——根因与②相同：force set 命中同一 profile 时 `addTempRule` 早退、路由未变故不刷新，呈现为“点了没反应”。
- **已确认决策（D28）**：popup 不再有模式概念。每个站点只有一条持久化的「当前」规则（WebDAV 同步）；选项页的「初始情景模式」改称「默认情景模式」，仅作为**新域名**的种子。文案「全局 / 本页」→「默认 / 当前」。
- **实现（2026-11-17）**：
  - `omega-web/src/popup/index.html`：删除整个 `#js-page-header`（含模式胶囊与整域提示行），列表区加 id `#js-profiles-section`，新增不可设置时的说明卡 `#js-unavailable`。
  - `omega-web/src/popup/js/profiles.js`：重写——删除 `OmegaPopup.mode` / `setMode` / `otherRule` / `renderInherited` / 作用域与主域偏好 / localStorage 记忆；新开无规则站点时 `seedProfile()` 取**实际命中的规则**（更宽的整域规则，否则默认 profile）播种（force set，不刷新页面）；点任意行 = force set 本 host 规则 + **强制刷新页面**（即使路由文本不变），重复点击同一行不再早退成“无反应”；系统代理 / 外部 PAC 时隐藏列表并显示说明；隐藏系统代理行与「添加条件」行；删掉改 switch profile 默认结果的 chevron。
  - `omega-web/src/popup/js/index.js`：`chooseProfile` 只走 `applyPageProfile`；`addTempRule` 增加 `refreshAlways` 参数。
  - `omega-target-chromium-extension/src/js/omega_target_popup.js` + `src/coffee/background.coffee`：`refreshAlways` 时跳过 before/after 比较，强制 `tabs.reload`；其余调用方行为不变。
  - `keyboard.js` / `keyboard_help.js` / `css/index.css`：删模式、系统代理、添加条件、下拉相关快捷键与样式。
  - i18n（`en_US` 源 + `zh_CN`）：删 `popup_mode*` / `popup_domainOverride*` / `popup_global*` / `popup_pageUsing` / `popup_pageProfilesFor` / `popup_tempRuleUnavailableHelp`；新增 `popup_currentProfilesFor` / `popup_currentSystem` / `popup_currentExternal`；`options_startupProfile` 改为「默认情景模式 / Default Profile」（仅文案，`-startupProfileName` 机制不变）。
- **影响**：默认 profile 只在**新域名**首次打开时播种；已访问过的站点改默认不会跟着变；popup 不再应用全局 profile（改在选项页「默认情景模式」）。旧的整域规则不再显示也不再新创建，但存储里仍在（被 host 规则遮蔽）。
- **验证（2026-11-17）**：`npm run build` 全绿（coffeelint 全过，jade 仅 2 条既有 warning）；omega-target **16 passing / 0 failing**；popup 六个文件构建产物与源逐字节一致，`_locales` 含新文案、旧文案已移除。Chromium + 构建产物 + chrome API 桩（临时 harness，不入库）核对：新域名播种一条 force set 规则（不刷新）、整域规则场景种子取实际命中的 `direct`（路由不变）、已有自身规则不再播种、点任意行（含重复点击同一行）均发 `refreshAlways: true` 且勾选跟随、系统代理 / 外部 PAC 时列表隐藏并显示说明、顶部卡片已移除。
- **待实机**：重载扩展后确认（i18n 需重载才生效），尤其是「点 auto switch 会刷新页面」与选项页「默认情景模式」文案。

### R26. 页面规则自动清理冗余项（与默认情景模式相同的规则） — 状态：**构建与单测通过，待实机确认**（2026-11-17）

- **背景**：R25 后每打开一个新站点的 popup 就播种一条规则，长期会积累大量记录。华总问「是否 30 天没使用就清理」。
- **关键约束**：PAC 由浏览器执行，扩展看不到某条规则这次是否真的用于路由（`webRequest` 监控默认关闭）。删除一条**非默认**规则会让该站点静默回落到默认——正是要避免的「擅自切换」。而删除一条 profileName 等于当前默认情景模式的规则，PAC 回落后结果完全相同，界面勾选也不变（原本就勾默认）。
- **已确认决策（D29）**：采用推荐方案——**只清与当前默认相同的规则**，不做「30 天未访问」的时间戳方案（那需要记录最后访问时间，且会真的改变被清理站点的路由）。
- **实现**：`omega-target/src/options.coffee` 新增 `pruneDefaultTempRules()`（返回删除条数，跳过 system / 外部 PAC，只删 profileName == 当前默认的规则，其余用 `replaceTempRules()` 一次性替换）；`omega-target/test/temp_rules.coffee` 新增 3 例；`omega-target-chromium-extension/src/module/options_backup.coffee` 新增 `omega.tempRulesCleanup` 闹钟（每 24h，仅缺失时创建），启动拉取后与闹钟触发都调 `pruneDefaultRules()`，清理经 `replaceTempRules` → `onTempRulesChanged` → 既有 WebDAV 三方合并同步推送到其它设备。
- **注意**：站点被清理后下次打开 popup 会按默认重新播种一条（界面无差异），因此可能产生一次冗余写；规则文件仍保持有界。
- **验证（2026-11-17）**：`npm run build` 全绿；omega-target **19 passing / 0 failing**（新增 3 例）；构建产物含 `pruneDefaultTempRules` 与 `omega.tempRulesCleanup` 闹钟创建 / 分发。

### R27. popup「作用范围」：本页 / 整域通配符 + 立即绑定子域 + 样式重做 — 状态：**构建与浏览器校验通过，待实机确认**（2026-11-17）

- **背景**：华总场景是页面 `postest.findfine.com` + API `postest-api.findfine.com` 要一起在「本地 FIDDLER / 直连」之间切。第一版做了「同域联动列表」（自动列出兄弟 host + 手动添加），但华总反馈：① 直接用回原设计的整域通配符 `*.findfine.com` 更简单，只要「本页 / 整域」两种；②「未联动 / 已联动」文字按钮不符合习惯，要做成真正的**开关**；③ 添加子域要**添加即绑定**，不能再点第二次；④ 样式丑，可整体重构，参考 Google M3 / iOS。
- **已确认决策（D30）**：`LINK_PREF` 的 `enabled` 迁移为 `wildcard`，作为 **iOS 风格开关**持久化到 `localStorage`（按主域）。开关只决定下一次点情景模式写到哪里：关 = 当前 host，开 = 主域 key（生成 `*.findfine.com` 规则）。开关本身不隐式写/删规则。额外绑定子域的输入框在点击「绑定」时**立即**用当前生效 profile 写一条 host 规则并生成 chip；chip 的 × 立即删除该规则。
- **实现**：`index.html` 的 `#js-link-section`（列表下方、选项行上方）为图标 + 状态/副标题 + `.om-switch` 开关 + 绑定区（输入框 / 按钮 / chip），内联 SVG 地球图标（不依赖图标字体）；`profiles.js` 新增 `wildcard` 偏好（兼容旧 `enabled`）、`isWildcard` / `currentRuleProfile` / `bindHost` / `unbindHost`，`linkedTargets()` 整域返回 `[domain, host]`（同时写两条同 profile 规则以消除 PAC 首条命中的遮蔽），去掉点击后的 `refreshPageInfo()` 竞态；CSS 按 M3 / iOS 重做（圆角卡片 + 轻阴影、44×26 药丸开关带滑块、tonal 输入框、filled 按钮、chip）；i18n（en_US 源 + zh_CN）新增 `popup_scope*` / `popup_bind*` 等、删旧 `popup_link*` 描述文案。临时 `[ZODIAG]` 排查日志已全部移除。
- **实机反馈后的修订**：
  - ① **切模式后勾选不跟随**：整域模式下残留的本机 host 规则遮蔽整域规则，加上点击后 `refreshPageInfo()` 与 reload 竞态读回旧 profile → 整域写两条规则消除遮蔽、去掉 Follow-up 读取。
  - ② **作用范围看不清 / 描述太多**：一度移到列表上方加说明，最终定稿列表下方 + 极简（删标题、提示行、整域说明行、绑定区标题）。
  - ③ **图标错乱**：`glyphicon-globe` 与自定义容器样式冲突 → 改内联 SVG。
- **验证（2026-11-17）**：`npm run build` 全绿；浏览器 harness 复现「整域模式 + 残留 host 规则」场景，点 FIDDLER 后写入 `findfine.com` 与 `postest.findfine.com` 两条规则且勾选从 auto switch 跟到 FIDDLER；本页模式绑定区可见、点选只写当前 host；绑定子域立即写规则、× 即删；核对元素顺序（列表 → 作用范围 → 选项）与 SVG 图标。
- **待实机**：重载扩展后确认（i18n 需重载才生效）。

<a id="r28"></a>

### R28. GitHub Actions 发版（GitHub + Gitee 双 Release）+ 更新检查改读 Releases API — 状态：**代码完成，构建与逻辑校验通过，待实机确认**（2026-11-18）

- **背景**：本 fork 已开源（GitHub `soldier-cv/ZeroOmega`），华总另建 Gitee 镜像 `huaxudong/ZeroOmega` 供国内下载。原发布链是内网 Woodpecker（`.woodpecker.yml`）把包丢到 100.64.0.88 的 `/res/zeroomega/`；扩展的更新检查（`update_check.coffee`）读该服务器上的静态 `version.json`。对开源分发而言，GitHub Release 才是权威发布面，内网源既不对公网用户可见、也不是"包从哪来"的真相。
- **已确认决策（D32 / D33 / D34）**：发版统一走 GitHub Actions，同时投递 GitHub Release 与 Gitee 镜像 Release；停用 Woodpecker。更新检查改为读两条 Releases API，Gitee 优先、GitHub 降级，保留既有定时/通知/「关于」页交互；未打包扩展仍用复制命令 + 重载，不静默自更新。
- **实现（2026-11-18）**：
  - `.github/workflows/release.yml`：重写。tag `v*` / 手动触发；新增「tag == 仓库 manifest == 包内 manifest」三处版本一致性校验与 CHANGELOG 段落检查（承接 AGENTS.md §2.13 的核对工作，分叉即失败）；构建后用 `zipfile` 复核包内版本；`sha256sum` 生成校验文件；发布说明从 CHANGELOG 对应版本段落提取（无段落回退最近提交）；`softprops/action-gh-release@v2` 上传两个 zip + 两个 sha256；随后 `Sync Release to Gitee` 用 `GITEE_TOKEN` 推 tag + 调 Gitee API v5 建/更新 Release + 先清同名旧附件再上传 4 个附件（`curl -F` 表单规避 WAF 对 JSON POST 的 400），失败只标 `::error::` 且 `continue-on-error` 不阻断 GitHub 发版。
  - `.github/workflows/sync-gitee.yml`（新增）：`custom_main` / `master` 推送时把源码分支强制镜像到 Gitee；tag 发版交给 release.yml，避免双重推送。
  - `omega-target-chromium-extension/src/module/update_check.coffee`：重写版本源。三级链路：Gitee API → GitHub API → GitHub `/releases/latest` 页面（跟随 302 从落地 URL 取 tag 再拼资产 URL）；Gitee 说"已是最新"时用 3 秒短超时向 GitHub 复核，探测失败维持原结论（不凭空提示有新版）；附件缺失报明确错误而非"无新版"；只放行 `gitee.com` / `github.com` / `objects.githubusercontent.com` / `github-releases.githubusercontent.com` 的 https 下载 URL；按 `navigator.userAgent` 选 `chromium-release.zip` / `firefox-release.zip`，兜底只接受 `.zip`；命令与说明页 URL 都来自当次发布响应（API 不可达时用 GitHub `/releases/latest/download/<asset>` 兜底命令）。原有 alarm（`omega.updateCheck`，启动 >30 分钟 + 每 6h）、每版本一次通知、点击打开「关于」保持不变；新增 `update.source` 状态。
  - `omega-web/src/partials/about.jade`：新增一行显示本次版本源；i18n（`en_US` 源 + `zh_CN`）更新 `options_updateFailed` / `options_updateAuto`，新增 `options_updateSource`。
  - 删除 `.woodpecker.yml`；`tools/ci/` 三个脚本为原静态接口的历史遗留，不再有 CI 引用。
- **取代关系**：R14 的"发布清单 → 命令"、R15 的静态 `version.json` / `version.txt` 端点与 D18 不再作为版本源；background 定时 + 每版本通知 + 「关于」UI（D20 / D34）保留。
- **验证（2026-11-18）**：
  - CoffeeScript 编译通过；`npm run build` 全绿（coffeelint 全过；首轮提交曾有 14 处超 80 列，均已折行修正），`npm run release` 实际产出 `dist/chromium-release.zip`（1,934,305 B）与 `dist/firefox-release.zip`（1,934,341 B），包内 manifest 版本均为 3.7.2；新 i18n 键 `options_updateSource` 已进入 en / zh / zh_CN 的 `messages.json`。
  - omega-target **19 passing / 0 failing**；omega-pac **143 passing / 1 failing**（既有 SOCKS5 用例，无新增回归）。
  - 两份 workflow YAML 经 PyYAML 解析通过；`Verify packaged version` 与 `Resolve release notes` 两段内嵌 Python 用真实 dist 包 / CHANGELOG 单独跑通（3.7.2 段落提取 520 字符）。
  - 更新检查 fetch 桩（临时 JS harness，不入库）9 个场景全过：Gitee 发现新版、Gitee 已是最新→GitHub 复核发现更新、复核失败维持无新版、Gitee 挂→GitHub 降级、两 API 挂→Releases 页面兜底拼 URL、不可信下载 URL 被拒、只有源码包时降级取正确资产、Firefox 选 firefox 资产、同版本只通知一次。该桩曾抓到重构时误把 Gitee API 写成 `https://gitee.com/<owner>/<repo>`（丢掉 `/api/v5/repos/`），已修复。
- **待实机**：重载扩展后确认（i18n 需重载才生效）；真正打 tag 前须按 AGENTS.md §2.13 核对版本/CHANGELOG/workflow，并在 GitHub 仓库配置 `GITEE_TOKEN` Secret。

## 决策与机制原文（2026-11-17 从 AGENTS.md 迁出，原样保留）

> 下表是迁出时决策日志的全文（仍有效与已被取代的都在）。此前档案中的 D6 / D7 / D11 / D12 / D13 与本表对应行逐字相同，不再另列。
> 同期从第 1 节删去的旧写法（已不再作为约束）：「3. 需求或状态有变化时，必须回填需求台账（第 3 节）与决策日志（第 5 节），并把关键结论同步到 ai-memory。」

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
| D14 | popup 一次点击只碰**当前作用域的那一条**临时规则：作用域切换不搬规则；切到「全局」与点全局行都**不删除**临时规则；「本页」只认本 host 自己的规则，继承来的整域规则只在「全局」视图以提示 + 显式「撤销」呈现；再点已生效的行只撤销这一条 | 维持 D13 的“共用一条路由 / 切全局即清除”（R10 实机证明会把别的子域正在用的路由删掉或改写） | 临时规则是 PAC 第一层且删了即失。D13 想消除“高亮与实际路由不一致”，但代价是一个页面的一次点击改了其它站点的路由，直接导致“本来可用的变得不可用”。高亮不一致改为用文案说明（副标题 + 整域覆盖提示），不再靠删除来对齐 |
| D15 | 模式（全局 / 本页）与作用域按 **host** 记住（`localStorage`），仅在 `pageModeAvailable()` 成立时回到「本页」；「本页」视图勾选**实际生效**的情景模式（本 host 规则 → 否则继承的整域规则），整域提示两种视图都显示；点继承来的那一行只为本 host 写规则 | 每次按「本 host 有无规则」推导模式 + 作用域固定重置为子域（R12 实机反馈“每次打开都回到全局”“子域选择像不生效”） | 模式与作用域只决定下一次点击改哪里，属界面偏好，记住它才不会让人每次都重新选；子域只设过整域规则时，隐藏该提示会让生效中的路由看起来“没设置”，把继承来的规则勾出来既符合实际，又不改动它的作用域 |
| D16 | popup 列表行点击 = **只应用、幂等**；撤销是列表标题旁显式按钮（「撤销本页规则」/「撤销主域规则」），无可用撤销动作时该按钮不出现；「本页」无生效规则时副标题如实写「跟随全局：X」；临时规则易失性放 tooltip | 保留「再点已生效的行 = 删除」，靠 tooltip 解释（R12 实机后复盘） | 「再点一次就没了」不可预见，且是「勾选没记住」错觉的根源；撤销需要标签、需要可发现，放在标题行只占一行、且不会误触。副标题写明实际生效路由，消除「本页没设置 = 没代理」的误解 |
| D17 | 更新只做「检查 + 复制命令 + 重载扩展」；版本与命令都取自发布服务器的 `manifest.json`，本地 6h 缓存，失败可重试，剪贴板失败回退发布说明页 | 让扩展自己下载并覆盖自身文件（FSA 目录授权 / native host）；自助 `.crx` + `update_url` | unpacked 扩展无法写自身文件，Windows Chrome 也封了自助 CRX 静默更新；本机已有 tag→CI→`/res/zeroomega/` 的完整发布链，缺的只是「发现新版 + 拿到那条命令 + 让新文件生效」三步，最小实现即可闭环 |
| D18 | 版本查询端点 = **静态文件** `/res/zeroomega/version.json` + `version.txt`；版本号只从分发 zip 内的 `manifest.json` 推导（脚本没有 `--version`）；`updated_at` 同版本沿用旧值；sha256 用实算值、但记录不一致必须让 CI 失败；URL 全为相对路径；新脚本复用 `refresh_res_manifest` 的原子写与总表汇总 | 直接复用分发包 `manifest.json` 当版本接口 / 让脚本接受 `--version` / 引入应用层 API / 写死 host 的绝对 URL | 分发包清单是给首页渲染的混合结构，字段语义会随展示需求漂移；任何另记的版本号都会与包不一致（tag 与包版本脱钩是真实事故面）；静态只读挂载没有写接口；绝对 URL 换 IP / 域名就失效 |
| D19 | 页面规则（临时规则）**持久化**到扩展自身状态区，重启浏览器后仍生效，直到手动撤销；WebDAV 同步用**独立小文件** `zeroomega-temprules.json`，每次修改「先拉 → 按站点三方合并（base = 上次与服务器一致的副本）→ 后推」，强 ETag 时 `If-Match` 防覆盖；同一站点两边都改时本机这次点击优先；开关默认开 | 继续只存 `chrome.storage.session`；把规则塞进 options 整体备份；last-write-wins 整文件覆盖；按时间戳逐条比较 | 华总要求「重开浏览器还是本页且勾选好」，会话存储做不到；规则随 popup 点击高频变化，进整体备份会让每次点击都推一份完整 options，且「从备份恢复」会把别的设备刚设的规则冲掉；整文件覆盖会丢另一台设备对其它站点的修改；三方合并只需一份 base，不依赖设备时钟 |
| D20 | 更新检查放 **background 定时**（启动 + 每 6h）+ 系统通知（每版本一次），UI 移到设置页「关于」，popup 不再放更新入口；版本源改为 R15 的 `version.json`；仓库内置最新 **PSL 全表**，不再用 tldjs 自带的 2017 年旧表 | popup 底部常驻两行（D17 原方案）；Native Messaging 全自动安装；升级 tldjs 大版本 | popup 空间宝贵，更新是低频事；自动检查 + 通知解决「忘了看」，复制命令 + 重载解决「怎么装」，不往系统装额外组件（华总选方案 A）。旧后缀表把 `ai.helunox.cc.cd` 的主域算成 `cc.cd`，「整个主域」会误伤所有 cc.cd 站点；只换数据表、不换库，改动最小 |
| D21 | service worker 里按 tabId 的 UI / 刷新调用一律用**回调 + 读 `lastError`**，不依赖 Promise；遇到标签已关闭就静默跳过 | 给每个 Promise 链补 `.catch()` / 忽略 | 标签可能在事件与调用之间被关闭，未处理的 rejection 会进扩展「错误」面板；回调式同时兼容 Chrome 与 Firefox 的 `chrome.*` 命名空间，且失败时本来就无事可做 |
| D22 | 页面规则收敛为**一址一规则**：只按当前完整 hostname；**模式即路由**（切到本页=写入/恢复该 host 的规则，默认当前全局 profile；切到全局=删除该 host 规则）；去掉作用域选择与撤销按钮；上次选择按 host 记在 `localStorage`；更宽的旧整域规则只在提示行报告 + 显式撤销 | 保持 R10/R13 的「作用域 + 视图偏好 + 显式撤销」；或切到全局时连带删主域规则 | 华总要的是「一个站点要么全局、要么本页，且切换要记住；本页永远有勾选」；一旦模式=视图、规则独立存在，就必须有撤销按钮，且“全局”视图下规则仍在生效，显示与实际路由脱节。整域规则是共享的，删它会连累兄弟子域，所以只保留提示行里的显式撤销，不并入 popup 的日常操作 |
| D23 | **只有活动页的实际代理结果变化才刷新页面**（消息处理前同步算 `before`、方法完成后算 `after`，相同则跳过刷新；任一侧未知或 URL 与活动 tab 不一致时保守刷新）；popup 写规则改用**显式意图**（`addTempRule` 的 `2` = force set、`-1` = force delete），不再用 toggle 语义 + 可能过期的本地 `pageInfo` 判断 | 维持「每次改动都 `tabs.reload`」；只在 popup 侧补「已生效就跳过」判断；改用 profile 名称字符串比较决定是否刷新 | 同一情景模式在全局/本页间切换时 PAC 结果不变，刷新只会丢表单/滚动/播放状态。toggle 语义把「设置 FIDDLER」变成「删除 FIDDLER 规则」：popup 缓存滞后于后台时，界面显示已勾选而实际请求走全局，正是华总截图里「切了没效果」的成因。显式意图让写入幂等、与视图状态无关；比较「实际路由」而不是「配置文本」，才不会把等价改写误判成变化 |
| D24 | 仓库根放一份 `favicon.svg`，用**品牌蓝圆角方块 + 白色 omega**（复用扩展图标的 path） | 直接拷 `omega-128.svg`（裸标透明底）/ 只放 PNG / 不提供 | OpenChamber 等项目列表只认 `favicon.*`，需要一个能被自动发现的图标；裸标在浅色下基本只剩一圈细线、深色下蓝线偏淡，反色瓷砖在浅 / 深界面下外观一致且 16px 下最稳；一份 SVG 覆盖所有尺寸，不必再维护多份位图 |
| D25 | 多设备感知 = **30 秒条件轮询 + 事件补拉**，不引入推送 | 维持 10 分钟全量轮询 / 引入 WebSocket 网关、Web Push、Native Messaging 或中间信令服务 / 照抄 FlClash 的手动备份 | dufs 只是带 WebDAV 方法的静态服务器，没有 `sync-collection`、SSE、长轮询，纯 WebDAV 下不存在推送通道；magpie 证明「缩短周期 + 条件请求让每轮几乎免费」即可：dufs 的 ETag 来自文件元数据，`If-None-Match` 命中时只回 304 空 body，30 秒一轮也不耗流量。再叠加 popup 打开 / 窗口聚焦补拉，把用户视角的延迟压到 0。FlClash 是纯手动整包备份（无定时、无 ETag、无合并），无可借鉴处。不新增依赖、不动 manifest / i18n / 路由语义；旧闹钟同名重建不会改周期，故改名迁移 |
| D26 | WebDAV 备份**保留最近 3 个选项文件**（`BACKUP_VERSIONS = 3`），上传成功后按 `getlastmodified` 从新到旧裁剪；**没有可用 mtime 的文件永不删除**、**列目录失败就整轮跳过裁剪**；设置页给「备份版本」下拉（默认最新），恢复可用任一份，id 走白名单校验。取代 D9 的「单份最新」 | 继续单槽（上传后删旧文件）；保留全部历史靠人工清理；把「覆盖保护」做成写入前确认 | 事故实证：某台默认配置的设备上传一次就把唯一的好备份 DELETE 掉，恢复端忠实照搬，于是「恢复出默认配置」——问题在上传侧的单槽策略，不在恢复。3 份足以覆盖「刚发现坏了」的场景，又不至于让目录无限膨胀；用 mtime 排序不依赖设备时钟；宁可多留文件也不删错，因为 `getlastmodified` 是唯一的排序依据。下拉默认最新，是因为日常操作仍是「恢复最近一次」，看历史是偶发需求。本次**未做**：服务端锁 / 覆盖保护 / 「恢复到缺少 profile 的 options 会清掉引用它的页面规则」 |
| D27 | 首次连接一个**已有备份**的服务器时**只读不写**：记 `adoptPending` 并暂停自动备份，设置页提示，由用户选「从备份恢复」或「立即备份」；服务器为空则首次上传即基线；恢复 / 显式备份记录 `syncedUri` 后自动备份恢复 | 首次配置自动从服务器恢复；维持「有变更就推」只靠 3 份历史兜底 | 华总指出「首次配置应该先从服务上拉取，而不是拿本地的去推送覆盖」。自动**推**已知会造成事故（默认配置覆盖好备份）；自动**拉**同样危险——事故里服务器那份正是坏的，会自动毁掉本机好配置。提示 + 两条显式出口对两个方向都安全，且不引入新的静默数据丢失；`syncedUri` 按 URI 记，换服务器会重新走首次检查 |
| D28 | popup **去掉模式概念**：每个站点一条持久化的「当前」规则（force set 写入），选项页的「默认情景模式」（原启动情景模式）只作新域名的种子；删除顶部站点卡 + 模式胶囊 + 整域提示行；点任意情景行（含已勾选项）= 写规则 + **强制刷新页面**；系统代理 / 外部 PAC 时只显示说明 | 保留「全局 / 本页」胶囊并把点击已选项当幂等无操作 / 仅在规则变化时刷新 / 继续展示整域规则提示行 | 模式与规则分离正是 BUG ①（整域提示）与②（点已选项被重算成全局）的来源；force set 早退 + 「路由未变不刷新」又让「点 auto switch 没反应」。合并成单一「当前」概念后，高亮与路由天然一致、无需撤销按钮；强制刷新让每次点击都有确定反馈。默认只种子新域名，避免改默认把已有站点冲掉；popup 不再改全局，全局收敛到选项页配置 |

## 构建说明与关键运行机制原文（2026-11-17 从 AGENTS.md §4.3 / §4.4 迁出）

> §4.3 的命令块仍留在 AGENTS.md。下面是当时的说明段落与 §4.4 全文。

- 各模块**当前没有 lockfile**；依赖安装结果不完全可复现（见 R3）。
- 本机（2026-10-16，Node 22）测试基线：omega-pac 142 通过 / **1 个既有失败**（`Profiles #pacResult` SOCKS5，疑依赖版本差异，与改动无关）；omega-target：`temp_rules` 6 个新增用例全通过，`options_sync` 有 **5 个既有失败**（sinon 1.x 定时器与 Node 22 不兼容）。新增/修改功能请对照此基线判断是否引入回归。
- **构建（2026-10-16 已完整跑通一次）**：`npm run deps` → `npm run build` 全程无错误（bower 依赖仍可从 GitHub 解析），产出 `omega-target-chromium-extension/build`（可加载的未打包扩展）。各模块 `grunt` 的 `default` 均含 `coffeelint`；改完代码本地至少跑对应模块的 `grunt`（或整体 `npm run build`）。
- **行尾要求（重要）**：仓库根 `.gitattributes` 固定 `*.coffee text eol=lf`。coffeelint 的 `max_line_length` 对“整行 URL 注释”的豁免匹配不了 CRLF 行尾，Windows（`core.autocrlf=true`）检出为 CRLF 时会误报超长行、让 `grunt` 失败；**不要删该文件，也不要把 coffee 工作区改回 CRLF**。
- **文案目录缓存（重要）**：`build/_locales/*/messages.json` 在**扩展加载时**一次性读入内存；改动 `omega-locales` 后必须「重新加载扩展」才生效。popup 的 HTML/CSS/JS 每次打开会从磁盘重读，因此会出现“新界面 + 空文案”的假象，勿误判为渲染 bug（2026-10-16 实机踩坑）。

### 4.4 关键运行机制

- **Profile 模型**：`omega-pac` 把 profile 编译为 PAC 脚本或固定配置，target 侧 `proxyImpl` 应用到浏览器。
- **临时规则（页面规则）**：隐藏的 `_tempProfile`（SwitchProfile）位于 PAC 第一层，按域名层级排序（子域在前，首条命中优先）。**持久化**在扩展自身状态区 `state.tempRules`（`{domain: profileName}`，经 idb-keyval 落盘，**浏览器重启后仍在**，直到手动撤销），在 `options.ready` 内恢复；3.6.4 及之前的 `chrome.storage.session` 旧数据首次启动时迁移。入口有 popup（当前站点一址一规则，打开时按默认 / 实际命中规则播种）、请求信息详情、网络监测页、临时规则管理器。`getPageInfo()` 为 popup 提供 `domain / host / subdomain / tempRuleProfileName（主域级）/ tempRuleHostProfileName（子域级）/ tempRuleMatch（PAC 实际命中的那条及其 key，系统代理为全局时为 null）`。主域按 `omega-pac/src/public_suffix_rules.json`（仓库内置的 PSL 全表，`tools/update_public_suffix.js` 刷新）计算，不用 tldjs 自带的旧表。
- **页面规则同步**：开启 WebDAV 且勾选「同步页面规则」（默认开）时，规则存在 `zeroomega/zeroomega-temprules.json`（与整体 options 备份分开）。每次修改 1s 防抖后「拉取 → 与 `state.tempRulesBase` 按站点三方合并 → 上传（强 ETag 时 `If-Match`，412 重试）」；background 启动时、**每 30 秒**（`omega.tempRulesPullV2` 闹钟，带 `If-None-Match`，304 时零传输）、popup 打开与窗口聚焦时各拉一次（后两者 30 秒内已同步则跳过）。失败按指数退避（30s→5min），本地改动 / 保存设置 / 手动同步不受退避限制。详见 R22 / D25。
- **整体 options 备份**：WebDAV 上传到 `zeroomega/zeroomega-<commitId>.json` + `zeroomega-commit.txt`，**保留最近 3 份**（按 `getlastmodified` 裁剪；列不出一律不删）。**首次连接一个已有备份的服务器时只读不写**：记 `state.optionsBackup.adoptPending`、暂停自动备份，设置页提示由用户选「从备份恢复」或「立即备份」；服务器为空时首次上传即基线；恢复或显式备份记录 `state.optionsBackup.syncedUri` 后自动备份（2s 防抖）恢复。详见 R23 / R24 / D26 / D27。
- **两套 popup**：默认 `popup-iframe.html` 内嵌 `popup/index.html`（新版原生 JS；无顶部站点卡、无「全局 / 本页」切换，只有一条「`<host>` 的当前情景模式」标题 + 一套情景模式列表 + 「选项」行）。**一址一「当前」规则**：每个完整 hostname 一条持久化规则；新域名首次打开时按「实际命中的规则（更宽的整域规则）→ 否则默认情景模式」播种（force set、不刷新页面）。点任意行（含已勾选行）= 写该 host 规则 + **强制刷新页面**（`refreshAlways`，即使路由文本不变），重复点击不再无反应；列表行勾选即当前规则。系统代理 / 外部 PAC 时列表隐藏、显示说明；系统代理行、「添加条件」行、改 switch 默认结果的 chevron、模式相关快捷键均已移除。选项页的「默认情景模式」（原「初始情景模式」，`-startupProfileName`）只作新域名种子，popup 不再应用全局 profile；旧的整域规则不再显示也不再创建，但仍在存储里被 host 规则遮蔽。「请求信息」表单仍走 Angular 版 `popup.html`（`popup.jade` + `popup.coffee`）。
- **更新检查**：background 的 `module/update_check.coffee` 读 R15 端点 `version.json`，打开浏览器时（距上次 >30 分钟）与每 6 小时（`omega.updateCheck` 闹钟）各查一次；发现新版本弹一次系统通知（每个版本一次），点击打开设置页「关于」。「关于」页的「更新」分组显示状态、命令原文与「复制更新命令 / 重载扩展 / 立即检查」。未打包扩展不能自更新，所以安装仍是 PowerShell 命令 + `chrome.runtime.reload()`。popup 里不再有更新入口。
- **版本查询接口**：`/res/zeroomega/version.json`（机器读，字段与顺序见 R15）+ `version.txt`（一行 `curl` 即得 `vX.Y.Z`）。CI publish 在刷新分发包清单后调用 `tools/ci/write_version_endpoint.py` 原子落盘，版本号取自分发 zip 内的 `manifest.json`；分发包卡片与 `/res/manifest.json` 总表会自动带一条 `version.json` link。
- **请求监控**（默认关闭）：`webRequest` 统计每标签页失败请求 → popup 顶部“N 资源未加载”入口（详情模式下可按 host 添加条件 / 临时条件）。
