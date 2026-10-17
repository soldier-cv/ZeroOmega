# 变更记录

本仓库是 [zero-peak/ZeroOmega](https://github.com/zero-peak/ZeroOmega) 的**自用 fork**，
基线 `v3.5.2`（commit `c367db2`，2026-09-09）。此处记录 fork 之后的变更。

> 不主动与上游同步（见 `AGENTS.md` §0）。

## 3.6.0

### 新增

- **WebDAV 自动备份 / 恢复**（替代 Gist 同步与在线恢复）：远端只保留单份最新 + 「自动备份」
  开关（默认关）+ 手动「立即备份 / 从备份恢复」。备份内容为完整 options JSON（`.bak` 格式），
  WebDAV 布局沿用既有约定（`zeroomega/` 子目录 + `zeroomega-commit.txt` + `zeroomega-<20hex>.json`），
  凭据只存本地。
- popup 收成「**全局 / 当前**」分段按钮 + 一套情景模式列表（键盘 `T` 切换）。
  「全局」= 跟随全局并清除本页临时规则；「当前」= 给本页写临时规则（再点同项即撤销）。
- 临时规则支持**作用域选择**（本子域 / 整个主域），并按域名层级排序（子域规则先于主域规则命中）。
- 内置主题改为 **iOS system 色系**（浅色 / 深色 / 自动），设置页样式打磨。

### 变更

- 设置页精简：条件类型固定为高级列表（去掉「显示高级切换条件」开关）、端到端移除「快速切换」、
  移除「导出旧版规则列表」。
- 扩展名走 i18n（`__MSG_manifest_app_name__`）。

### 修复

- **WebDAV 备份的 URI 输入框会静默丢值**：填不带 `http://` 的地址（如 `100.64.0.88:13306`）时，
  `input[type=url]` 的校验不通过，AngularJS 把 `ng-model` 置成 undefined —— 页面无任何提示、
  保存还提示「备份设置已保存。」，随后备份/恢复一律报 `WebDAV URI is required.`。
  改为 text 输入 + 保存时自动补全 scheme。
- **「从备份恢复」成功后页面不刷新**：`options.reset` 在 background 侧整体替换 options 且不触发
  变更通知，页面副本保持旧值，看起来像「提示成功但没生效」。改为恢复成功后刷新页面。

### 构建 / 分发

- 接入 **Woodpecker** 流水线（`.woodpecker.yml`）：`tag v*` / 手动触发，日常 push 不触发。
  步骤 `resolve-tag → build → test → publish → smoke`，产物落到内网分发区
  `/data/static-deploy/res/zeroomega/`（zip + sha256 + 刷新 `/res/manifest.json`），
  并带单测闸门（按 `AGENTS.md` §4.3 基线）与产物冒烟校验。
