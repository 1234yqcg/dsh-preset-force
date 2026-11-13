# dsh-preset-force（社区修复版）

基于 npm 包 `@wasd258/dsh-preset-force@0.1.2` 的本地修复版本。
原作者仓库（`WASD258-jpg/dsh-preset-force`）已不可访问，这里按 MIT 许可保留原
`LICENSE` / `NOTICE` 与署名，在此基础上补齐发布缺失的文件并做兼容性修复。

## 与 0.1.2 的差异

- **补齐 `cordis.patch.yml`**：0.1.2 的 `package.json` 声明了
  `dsh.bundle.patch: ./cordis.patch.yml`，但包里并没有这个文件，导致 bundle 无法注册。
  现在提供 insert 补丁，并把该文件加入 `files` 列表。
- **`lib/index.js`**（+42/−6）：新增 `liveSessions()`，向客户端暴露在线会话列表
  （id / 标题 / 状态 / 当前模式），供客户端兜底控件选择；标题字段做了多候选防御式读取。
- **`lib/client.js`**（+233/−38）：模块注册 id 从 `dsh-preset-force` 改为**包名**
  `@wasd258/dsh-preset-force`（客户端加载器按包名匹配图谱条目）；加
  `__DSH_PRESET_FORCE_REGISTERED__` 防重复注册；UI 改为复用 DSH 设计变量。
- **`package.json`**：补 `bundle.patch`；`dsh.client.inject` 由
  `[dsh-client-runtime, dsh-client-ui-slots, dsh-client-ui-conversation]` + `immediately`
  收窄为只 `dsh-client-ui-slots`；版本号改为 `0.1.3`。

## 0.1.4 变更

- **`lib/client.js` 修复「首次切换后下拉文字不更新」**：插槽版下拉的 `refresh()`
  原先用
  `setPicked((p) => (p && available.some((a) => a.id === p) ? p : data.current || ""))`，
  只要旧值仍是合法 id 就永不采纳服务端返回的 `current`，导致切换成功后显示滞后一步，
  必须再点一次（走 `id === state.current` 的 guard）才刷新。现改为无条件采纳
  `data.current`，失败路径仍显式回滚到 `state.current`；同时用 `busyRef` 做 `busy`
  的同步镜像（轮询与 `onChange` 都会读到陈旧闭包），并把 `busyRef` 复位提前到
  `refresh` 的所有返回路径之前，避免 `ok:false` 时控件永久禁用。
- **`README.md` / `README.zh-CN.md`**：HTTP 路由前缀由 `/api/dsh-preset-force`
  更正为 `/dsh-preset-force`，与 `lib/index.js` 中 `webServer.register({ path: "/dsh-preset-force" })`
  的实际注册保持一致（旧文档里的路径会直接 404）。

## 安装

```powershell
# 桌面 App 读的是 desktop profile；CLI `dsh web` 用 --profile web
dsh plugin --profile desktop add git+https://github.com/1234yqcg/dsh-preset-force.git
```

`dsh plugin` 会把参数转给 profile 内的 pnpm，并在安装后自动核对
`dsh.profile.bundles`——本包声明了 `dsh.bundle.patch`，所以会被自动加入 bundle
列表。**不需要手工编辑 `package.json`**（早期版本的本文件要求手工追加，那个说法已过时）。

改代码时改用本地目录安装，`lib/*.js` 的改动由客户端 HMR 监视，只需刷新页面：

```powershell
dsh plugin --profile desktop add file:D:\path\to\dsh-preset-force
```

## 注意

- 包名仍是 `@wasd258/dsh-preset-force`，bundle id 无需改动。
- **不要从 npm 安装**：npm 上只有官方 0.1.2，它缺 `dsh.bundle.patch`、
  缺 `cordis.patch.yml`、client 注册 id 也不是包名，装上不会加载任何东西。
  只从本仓库的 git 源安装。
- 0.1.4 与 0.1.3 的差异仅在 `lib/client.js` 的插槽下拉状态机与文档路由前缀，
  宿主半部 `lib/index.js` 未改动。
