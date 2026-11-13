# dsh-preset-force

[English](./README.md) | 中文

强制切换 DSH 会话的 agent preset（模式）——即使会话已经开始。绕过「仅空白会话可切换」的内置锁定，会话中途即可从极简切到标准（或任意 preset）。三个入口：`/preset` 命令、`set_agent_preset` 工具、输入框工具行的紧凑模式下拉。

> 社区项目——非 DeepSeek 官方插件，不代表 DeepSeek 的任何背书。

## 功能特性

- **任意会话随时可切** —— 不要求会话为空；网关的 `agent-preset-locked` 拒绝被设计性地绕过
- **`/preset` 命令** —— 在输入框敲 `/preset` 列出当前模式与全部可用模式，或 `/preset <id>` 强制切换当前会话
- **`set_agent_preset` 工具** —— 模型可应你的要求切换模式；注册在宿主平面，所有 preset 下都可见
- **输入框工具行下拉** —— 注入 `conversation.input.right` 槽位的紧凑模式选择器，位于模型选择器旁；每 5 秒自动刷新，选中即切换
- **会话日志一致** —— 追加与网关相同的 `agent-preset/selected` 事件：头部标签刷新、冷读回放按切换后的组装重建（「模型可见 ⟺ 已落日志」不变量）
- **安全护栏** —— 只允许切换顶层会话，子代理一律拒绝；HTTP API 仅限回环并做 Host 头校验

## 安装

需要带 Web 应用的 DSH profile（`@deepseek-ai/dsh-web-app`）。桌面 App 启动的是
`desktop` profile，所以桌面用户用 `--profile desktop`；CLI `dsh web` 用 `web`。

> **不要从 npm 安装。** npm 上的 `@wasd258/dsh-preset-force` 停在 `0.1.2`，那个版本
> **装不出功能**：它没有声明 `dsh.bundle.patch`、包里也没有 `cordis.patch.yml`，客户端
> bundle 还把注册 id 写成 `dsh-preset-force` 而不是包名。装上只是一个普通依赖，什么都不加载。
> 本 fork（`0.1.4`）修好了这三处，请**从本仓库安装**。

### 方式 A：从本仓库安装（推荐）

```powershell
# 桌面 App
dsh plugin --profile desktop add git+https://github.com/1234yqcg/dsh-preset-force.git

# CLI dsh web
dsh plugin --profile web add git+https://github.com/1234yqcg/dsh-preset-force.git
```

`dsh plugin` 把参数转给 profile 目录下的 pnpm，随后会自动核对 `dsh.profile.bundles`：
本包声明了 `dsh.bundle.patch`，因此会被**自动加入** bundle 列表，**无需手工改
`package.json`**。

等价的手动写法：

```powershell
cd "$env:USERPROFILE\.dsh\profiles\desktop"   # 或 $DSH_HOME/profiles/<profile>
pnpm add git+https://github.com/1234yqcg/dsh-preset-force.git
```

### 方式 B：从本地目录安装

改插件代码时用这个（`lib/*.js` 的改动会被客户端 HMR 监视，只需刷新页面）：

```powershell
dsh plugin --profile desktop add file:D:\path\to\dsh-preset-force
```

### 验证

重启一次 DSH（之后 bundle 变更会自动热发布），然后**刷新浏览器页面**。宿主半部的
路由挂在 `/dsh-preset-force`，发一个 GET 就能确认插件已挂载：

```powershell
Invoke-WebRequest http://127.0.0.1:<web-port>/dsh-preset-force/status -UseBasicParsing
```

返回 `"ok": true` 和 `available` 列表 → 宿主半部正常；输入框旁出现模式下拉 → 客户端半部已加载。

## 使用

### `/preset` 命令

直接在输入框敲。无参数（`/preset`、`/preset list`、`/preset ls`、`/preset ?`）时列出当前模式与全部可用模式：

```
当前模式：standard（标准模式）
可用模式：
  minimal（极简模式）
  standard（标准模式） ← 当前
  code（代码模式）
  cordis（创造模式）
  my-custom（我的自定义模式）

用法：/preset <模式id> —— 强制切换当前会话的模式（不要求会话为空，工具集立即更换）
```

带参数：

```
> /preset code          # 切换
已强制切换当前会话模式：standard → code。模型可见的工具与提示词已更换；已产生的历史记录保持原样。
> /preset code          # 已经是目标模式
当前会话已经是模式 code。
> /preset bogus         # 失败
切换失败：<原因>
```

### `set_agent_preset` 工具

模型按你的要求调用；工具注册在宿主层，工具注册表按 `agent → preset → global` 解析，因此每个 preset 下都可见。

| 参数 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `preset` | string | 是 | 目标模式 id（`standard` / `minimal` / `code` / `cordis`，或本地自建 id）；传 `""` 列出可用项 |

```jsonc
{ "preset": "code" }   // → { "ok": true, "from": "standard", "to": "code" }
{ "preset": "" }       // → { "ok": true, "unchanged": true, "available": [ { "id": "minimal", "name": "极简模式" }, ... ] }
// 子代理调用          // → { "ok": false, "error": "set_agent_preset 只能切换顶层会话的模式，子代理不可切换。" }
```

返回结构：`{ ok, from?, to?, unchanged?, available?, error? }`。

### 输入框工具行下拉

紧凑模式选择器位于输入工具行（`conversation.input.right` 槽位，order 10，标签「模式切换」），紧挨模型选择器：

1. 点开下拉，所有可用模式以 `名称 (id)` 形式列出。
2. 选中即切换，立即生效，下拉会马上显示新模式。
3. 失败时弹出浏览器提示，并回退到原模式。

下拉每 5 秒轮询一次 `/status`（任何入口导致的模式变化都会在一个周期内反映出来）；切换进行中、会话不在运行、或未装配 presets 时禁用（无 presets 时显示一个禁用的「模式」项）。

插槽体系不可用时（例如桌面 App 外壳内），插件会退化为一个锚定在输入框旁的纯 DOM
控件；该兜底控件在存在多个顶层会话时会额外提供一个会话选择器。

## HTTP API

宿主在 `/dsh-preset-force` 前缀下注册路由：

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/status` | 查询会话当前模式 + 可用列表（`?sessionId=`） |
| POST | `/switch` | 强制切换会话，请求体 `{"sessionId","preset"}` |

### GET /dsh-preset-force/status?sessionId=xxx

| 参数 | 位置 | 说明 |
|---|---|---|
| `sessionId` | query | 要查询的会话 |

响应——`current` 为当前组装的 preset id，`available` 每项携带 `{ id, name, trust, broken }`：

```json
{ "ok": true, "live": true, "sessionId": "s-abc123", "current": "standard",
  "available": [ { "id": "standard", "name": "标准模式" }, { "id": "minimal", "name": "极简模式" } ] }
```

会话不在运行时 `live` 为 `false`，省略 `current`：`{ "ok": true, "live": false, "sessionId": "s-ghost", "available": [ ... ] }`。

### POST /dsh-preset-force/switch

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `sessionId` | string | 是 | 要切换的会话 |
| `preset` | string | 是 | 目标模式 id |

```json
// 请求
{ "sessionId": "s-abc123", "preset": "minimal" }
// 响应
{ "ok": true, "from": "standard", "to": "minimal", "sessionId": "s-abc123" }
// 已是目标模式
{ "ok": true, "unchanged": true, "from": "minimal", "to": "minimal", "sessionId": "s-abc123" }
```

### 错误情况

| 状态码 | 条件 | `error` 内容 |
|---|---|---|
| 403 | 非回环源地址 | `preset-force API is loopback-only` |
| 403 | Host 头不是当前端口的 `127.0.0.1` / `localhost` / `[::1]` | `invalid host header` |
| 403 | 跨源页面发起的写请求 | `cross-origin request rejected` |
| 415 | `Content-Type` 不是 `application/json` | `Content-Type 必须是 application/json` |
| 400 | 请求体不是有效 JSON（超过 64 KiB 的请求体会被提前拒绝） | `请求体不是有效 JSON` |
| 404 | 会话不在运行中 | `会话 <id> 不在运行中，无法切换` |
| 404 | 未知路由 | `unknown route: <route>` |
| 500 | 宿主侧意外错误 | 错误消息字符串 |

## 工作原理

- `lib/index.js`（宿主半部）注入 `commands, tools, agentPresets, agents, webServer`，注册 `/preset` 命令、`set_agent_preset` 工具与 HTTP 路由。
- 网关 RPC（API 代理里的 `agentPresets.select`）在传输层做 `sessionBlank()` 检查；`recompose()` 服务本身**不检查**（"由调用方负责该检查"）。本插件因此在宿主平面直接调用 `ctx.agentPresets.recompose(agent.ctx, id)` 并追加 `agent.session.append("agent-preset/selected", { agentPreset })` —— 与网关 RPC 的唯一差别就是跳过空白检查。
- `dsh-agent-presets` 把该事件重发为不带 scope 的 cordis 事件：客户端头部标签刷新、冷读回放重建切换后的组装——「模型可见 ⟺ 已落日志」不变量成立。
- `set_agent_preset` 有守卫：调用方必须是存活 agent、必须是该会话自己的活跃驱动、必须是根会话（`ctx.agents.roots()`）；子代理一律拒绝。
- `lib/client.js`（web 半部）注入 `conversation.input.right` 槽位渲染下拉；每 5 秒轮询 `/status`，选中即 POST `/switch`。
- HTTP 路由仅限回环：源地址必须是 `127.0.0.1` / `::1`，Host 头必须是当前端口的回环主机名（防 DNS rebinding，GET/POST 一视同仁）；写操作额外要求同源 + `application/json`。

## 隐私与安全

- 无外部网络请求、无遥测、不碰凭据；数据不离开本机
- API **仅限回环**（源地址 + Host 头双重校验）：即使 DSH 绑定 `0.0.0.0`，本插件的 API 也不会暴露到局域网/公网
- 写操作额外要求 `Content-Type: application/json` 且浏览器请求同源，阻断恶意网页的跨站切换
- **威胁模型**：本 API 设计上无鉴权，只服务本机——任何本地进程都能读取并驱动写操作。请在可信的本机环境运行 DSH

## 兼容性

- DSH Web profile bundle（`@deepseek-ai/dsh-web-app`）；桌面 App 与 CLI `dsh web` 均可用
- 示例中的 preset id（`standard` / `minimal` / `code` / `cordis`）取自 DSH 默认 roster；不同 profile 可能定义不同集合 —— 用 `/preset list` 查看实际已安装的模式
- Node.js >= 22.19.0（`package.json` `engines`）

注意事项：

- 会话中途切换会立即改变模型可见的工具 schema：旧 preset 的工具消失、新 preset 的工具出现；历史中新模式不具备的工具调用重放可能失败——建议在轮次之间切换；能力超集方向（`minimal` → `standard`）最安全
- 只允许切换顶层会话，子代理拒绝
- 客户端模块依赖 DSH web UI 槽位体系（`@deepseek-ai/dsh-client-ui-*`）；安装后需刷新浏览器

## 官方生态要求

按 [DeepSeek Harness CONTRIBUTING](https://github.com/deepseek-ai/deepseek-harness/blob/main/CONTRIBUTING.md)，官方仓库不接受外部 PR；社区插件放在各自仓库并添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic 便于发现。本仓库遵循此约定：独立社区项目，与 DeepSeek 无隶属或背书关系。

## 许可

MIT —— 见 [LICENSE](LICENSE)。部分内容参考 DeepSeek Harness；来源与免责声明见 [NOTICE](NOTICE)。
