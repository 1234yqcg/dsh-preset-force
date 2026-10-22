# dsh-preset-force

[中文](./README.zh-CN.md) | English

Force-switch the agent preset (mode) of a DSH session even after it has started — bypassing the built-in "blank sessions only" lock, so you can move from Minimal to Standard (or any preset) mid-conversation via the `/preset` command, the `set_agent_preset` tool, or a compact composer tool-row dropdown.

> This is a community project. It is not an official DeepSeek plugin and does not imply any endorsement by DeepSeek.

## Features

- **Switch any session at any time** — no blank-session requirement; the gateway's `agent-preset-locked` refusal is bypassed by design
- **`/preset` command** — type `/preset` in the composer input to list the current mode and the roster, or `/preset <id>` to force-switch the session
- **`set_agent_preset` tool** — the model can switch modes on request; registered on the host plane, so it stays visible under every preset
- **Composer tool-row dropdown** — compact selector in the `conversation.input.right` slot next to the model picker; auto-refreshes every 5 seconds and switches immediately on selection
- **Consistent session log** — appends the same `agent-preset/selected` event the gateway writes, so the header label refreshes and cold replays reconstruct the switched composition (model-visible ⟺ logged)
- **Safety rails** — top-level sessions only; subagents rejected; loopback-only HTTP API with Host-header validation

## Install

Requires the DSH web profile (`@deepseek-ai/dsh-web-app`).

1. Clone or download this repository:

   ```powershell
   git clone https://github.com/WASD258-jpg/dsh-preset-force.git
   ```

2. Install into the DSH profile dependency directory — choose one (on Linux/macOS use `~/.dsh` or `$DSH_HOME` instead of `$env:USERPROFILE\.dsh`):

   **Option A: npm install (recommended)**

   ```powershell
   cd "$env:USERPROFILE\.dsh\profiles"
   npm install @wasd258/dsh-preset-force --no-save
   ```

   **Option B: copy from source**

   ```powershell
   $src = '.\dsh-preset-force'
   $dst = "$env:USERPROFILE\.dsh\profiles\node_modules\@wasd258\dsh-preset-force"
   New-Item -ItemType Directory -Force -Path "$dst\lib" | Out-Null
   Copy-Item "$src\package.json" $dst -Force
   Copy-Item "$src\lib\index.js","$src\lib\client.js" "$dst\lib" -Force
   Copy-Item "$src\LICENSE","$src\NOTICE" $dst -Force
   ```

3. Register the package as a bundle of your profile (or run `dsh plugin --profile web add @wasd258/dsh-preset-force`): append the package name to `dsh.profile.bundles` in `$DSH_HOME/profiles/<profile>/package.json`:

   ```json
   {
     "name": "dsh-profile-web",
     "private": true,
     "dependencies": {},
     "dsh": {
       "profile": {
         "bundles": [
           "@deepseek-ai/dsh-base",
           "@deepseek-ai/dsh-web-app",
           "@wasd258/dsh-preset-force"
         ]
       }
     }
   }
   ```

4. Restart DSH web (or hot-mount the bundle without a restart), then **refresh the browser page** so the client module (`lib/client.js`, loaded immediately on the web platform) is picked up.

## Usage

### `/preset` command

Type it in the composer input. With no argument (`/preset`, `/preset list`, `/preset ls`, `/preset ?`) it prints the current mode and the full roster:

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

The host emits these strings in Chinese: first line = current mode (`（未加入 preset）` when none), rows = `<id>（display name）`, ` ← 当前` marks the active one, ` [损坏: ...]` a broken preset; last line = usage hint.

With an argument:

```
> /preset code          # switch
已强制切换当前会话模式：standard → code。模型可见的工具与提示词已更换；已产生的历史记录保持原样。
> /preset code          # already on target
当前会话已经是模式 code。
> /preset bogus         # failure
切换失败：<reason>
```

The success line reads: "Force-switched this session's mode: `standard` → `code`. The model-visible tools and prompts have been replaced; existing history is left as-is."

### `set_agent_preset` tool

The model calls it on your behalf; visible under every preset (the tool registry resolves `agent → preset → global`).

| Parameter | Type | Required | Description |
|---|---|---|---|
| `preset` | string | yes | Target preset id (`standard` / `minimal` / `code` / `cordis`, or a locally authored id); pass `""` to list available ids |

```jsonc
{ "preset": "code" }   // → { "ok": true, "from": "standard", "to": "code" }
{ "preset": "" }       // → { "ok": true, "unchanged": true, "available": [ { "id": "minimal", "name": "极简模式" }, ... ] }
// subagent call       // → { "ok": false, "error": "set_agent_preset 只能切换顶层会话的模式，子代理不可切换。" }
```

Result shape: `{ ok, from?, to?, unchanged?, available?, error? }`.

### Composer tool-row dropdown

A compact selector in the input tool row (`conversation.input.right` slot, order 10, label "模式切换"), next to the model picker:

1. Open it — every available mode is listed as `name (id)`.
2. Pick one; the session switches immediately.
3. On failure a browser alert shows the reason and the selection snaps back.

It polls `/status` every 5 seconds (changes from any entry point are reflected) and is disabled while a switch is in flight, when the session is not live, or when no presets are installed (a single disabled "模式" entry).

## HTTP API

Host routes under `/api/dsh-preset-force`:

| Method | Path | Description |
|---|---|---|
| GET | `/status` | current preset + roster for a session (`?sessionId=`) |
| POST | `/switch` | force-switch a session, body `{"sessionId","preset"}` |

### GET /api/dsh-preset-force/status?sessionId=xxx

| Parameter | Location | Description |
|---|---|---|
| `sessionId` | query | the session to inspect |

Response — `current` = composed preset id, each `available` entry is `{ id, name, trust, broken }`:

```json
{ "ok": true, "live": true, "sessionId": "s-abc123", "current": "standard",
  "available": [ { "id": "standard", "name": "标准模式" }, { "id": "minimal", "name": "极简模式" } ] }
```

If the session is not running, `live` is `false` and `current` is omitted: `{ "ok": true, "live": false, "sessionId": "s-ghost", "available": [ ... ] }`.

### POST /api/dsh-preset-force/switch

| Field | Type | Required | Description |
|---|---|---|---|
| `sessionId` | string | yes | session to switch |
| `preset` | string | yes | target preset id |

```json
// request
{ "sessionId": "s-abc123", "preset": "minimal" }
// response
{ "ok": true, "from": "standard", "to": "minimal", "sessionId": "s-abc123" }
// already on the target
{ "ok": true, "unchanged": true, "from": "minimal", "to": "minimal", "sessionId": "s-abc123" }
```

### Error cases

| Status | Condition | Body `error` |
|---|---|---|
| 403 | non-loopback source address | `preset-force API is loopback-only` |
| 403 | Host header not `127.0.0.1` / `localhost` / `[::1]` on the current port | `invalid host header` |
| 403 | cross-origin write | `cross-origin request rejected` |
| 415 | `Content-Type` not `application/json` | `Content-Type 必须是 application/json` |
| 400 | body not valid JSON (bodies > 64 KiB are rejected early) | `请求体不是有效 JSON` |
| 404 | session not running | `会话 <id> 不在运行中，无法切换` |
| 404 | unknown route | `unknown route: <route>` |
| 500 | unexpected host error | error message |

## How it works

- `lib/index.js` (host) injects `commands, tools, agentPresets, agents, webServer`; registers the `/preset` command, the `set_agent_preset` tool and the HTTP routes.
- The gateway RPC (`agentPresets.select`) checks `sessionBlank()` in the transport layer; `recompose()` itself does **not** ("the caller owns that check"). The plugin calls `recompose(agent.ctx, id)` from the host plane and appends `agent.session.append("agent-preset/selected", { agentPreset })` — the only difference from the gateway RPC is skipping the blank check.
- `dsh-agent-presets` re-emits that event unscoped, so the header label refreshes and cold replays reconstruct the switched composition (model-visible ⟺ logged).
- `set_agent_preset` guards: live agent, its own active driver, root session (`ctx.agents.roots()`); subagents refused.
- `lib/client.js` (web) injects the `conversation.input.right` slot, polls `/status` every 5 s, POSTs `/switch` on pick.
- HTTP is loopback-only (source address + Host header, GET and POST alike); writes additionally require same-origin + `application/json`.

## Privacy & security

- No network requests, no telemetry, no credentials; nothing leaves the machine
- Loopback-only API (source address + Host header): not reachable from LAN/public even if DSH binds `0.0.0.0`
- Writes require `application/json` + same-origin browser request, blocking cross-site switching from malicious pages
- **Threat model**: unauthenticated by design, local machine only — any local process can read it and drive its writes. Run DSH in a trusted local environment

## Compatibility

- DeepSeek Harness web profile, at the bundle-interface era of commit [`47f9438`](https://github.com/deepseek-ai/deepseek-harness/tree/47f943859bef60e4160492346772ded9b24f765a)
- Node.js >= 22.19.0 (`package.json` `engines`)

Notes:

- Mid-session switching changes the model-visible tool schema immediately: old preset tools disappear, new ones appear; replaying history that called tools the new preset lacks may fail — prefer switching between turns; superset directions (`minimal` → `standard`) are safest
- Only top-level sessions can be switched; subagents rejected
- The client module targets the DSH web UI slot system (`@deepseek-ai/dsh-client-ui-*`); refresh the browser after install

## Official ecosystem requirements

Per [DeepSeek Harness CONTRIBUTING](https://github.com/deepseek-ai/deepseek-harness/blob/main/CONTRIBUTING.md), the official repository does not accept external PRs; community plugins live in their own repositories and carry the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic. This repository follows that: an independent community project, not affiliated with or endorsed by DeepSeek.

## License

MIT — see [LICENSE](LICENSE). Portions reference DeepSeek Harness; provenance and the non-affiliation statement are in [NOTICE](NOTICE).
