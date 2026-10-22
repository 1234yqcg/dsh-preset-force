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

## 安装

```bash
# 在 DSH profile 目录（如 ~/.dsh/profiles/desktop）执行
pnpm add github:1234yqcg/dsh-preset-force
```

然后在 `package.json` 的 `dsh.profile.bundles` 中加入 `@wasd258/dsh-preset-force`，
重启 DSH。

## 注意

- 包名仍是 `@wasd258/dsh-preset-force`，bundle id 无需改动。
- 如果同时安装了 npm 上的 0.1.2，两者同名，请只保留一个。
