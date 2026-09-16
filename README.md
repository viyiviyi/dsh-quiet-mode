# dsh-quiet-mode

给 DeepSeek Harness（dsh）的每一轮模型请求注入一条固定的作业纪律：

> 请\*\*保持静默，专注干活，不胡思乱想，不过度思考，不过度设计，不虚构历史，不清晰就询问，不猜测或假定目标，不创造名词概念，不使用缩写，坚持使用简体中文进行思考和回复\*\*

（`**` 按你的要求逐字保留。）

## 它是怎么起作用的

dsh 的插件是一个 npm 包，通过 `package.json` 的 `dsh.bundle.patch` 指向 `cordis.patch.yml`
声明自己是 bundle；安装后这一层配置自动挂进 profile 的配置栈，把下面这一行插进插件行列表：

```yaml
- insert:
    - id: quiet-mode
      name: dsh-quiet-mode
```

宿主侧 `lib/index.js` 就是一个标准 Cordis 插件（`{ name, inject, apply }`）。它 `inject: ['systemPrompt']`，
在服务就绪后调用 `ctx.systemPrompt.section()` 注册一个提示词段落：

- **段落名** `quiet-mode`（注册表要求唯一，重复注册会直接抛错）
- **order** = `getSectionOrder('DEPLOYMENT_PERSONA') + 1`，即紧跟在部署人设之后，
  排在计划策略（500）和所有工具指引（1000 起）之前
- **文本** 静态，随 agent 生命周期只注册一次

`dsh-system-prompt` 在每个模型步骤之前组装一次系统提示词，所以只要这一行在会话建立前挂上，
就等于「会话开始时注入」——准确说，是这句话出现在该会话**每一次**模型请求的系统提示词里。

选提示词段落而不是会话事件，是因为段落是静态的：前缀在整个会话内不变，不会破坏 KV 缓存复用。
而写成 runtime context 或 `session.append` 的 user 角色快照，会让这句话进入每个请求的消息历史并随轮次增长。

## 安装

```powershell
dsh plugin --profile web add C:\apps\dsh_workspace\dsh-quiet-mode
```

命令会把包写进 `$DSH_HOME/profiles/web`，并自动把 `dsh-quiet-mode` 追加到
`dsh.profile.bundles`（因为它的 `package.json` 声明了 `dsh.bundle.patch`）。

检查配置层是否挂上：

```powershell
dsh --profile web --dump-config | Select-String quiet-mode
```

## 生效

**插件在启动时加载，改完必须重启 `dsh web` 才会生效。**

重启前可以先用本地验证脚本确认插件本身没问题（不依赖 dsh 进程）：

```powershell
cd C:\apps\dsh_workspace\dsh-quiet-mode
node verify.mjs
```

脚本做三类检查：注册契约（伪 ctx 断言注册了什么）、端到端（用真实 cordis + dsh-system-prompt
组装一次系统提示词并断言整句出现、且排在人设之后、且只出现一次）、生命周期（卸载插件行后段落被撤销）。

## 配置

默认值写在 `lib/index.js` 里，运行时配置在**你自己的** profile 配置层覆盖——不要改包内的
`cordis.patch.yml`，包更新会覆盖它。

`$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
- id: quiet-mode
  config:
    enabled: true          # 设为 false 可临时关掉，不注册任何段落
    text: '自定义的纪律文本'  # 留空或不写则用默认整句
```

注意 profile 的这一层优先级高于 bundle 层；按行覆盖时 `config` 是**整体替换**，
不是逐字段深合并，所以覆盖时要把想保留的字段一起写全。

## 卸载

```powershell
dsh plugin --profile web remove dsh-quiet-mode
```

## 开发提示

- 本地路径安装用的是 `link:`（junction 指向源码目录），所以改完源码重启即可，不必重新 `add`。
  如果用的是 `file:` 说明（或以后被改成复制），则需要 `remove` 再 `add`，否则跑的还是旧代码。
- 包内的 `node_modules/@deepseek-ai` 是指向 `$DSH_HOME/profiles/node_modules/@deepseek-ai`
  的 junction，只为让 `node verify.mjs` 能在工作区里解析 `@deepseek-ai/schemastery`；
  它已在 `.gitignore` 里，也不会进发布产物。
- `verify.mjs`、`.gitignore` 都不在 `package.json` 的 `files` 白名单里，不会随包发布。

## 目录结构

| 文件 | 职责 |
|---|---|
| `package.json` | 包声明与 `dsh.bundle.patch` 指向 |
| `cordis.patch.yml` | bundle 配置层：把 `quiet-mode` 行插入插件列表 |
| `lib/index.js` | 插件入口：Config schema、段落注册 |
| `verify.mjs` | 本地验证脚本（不发布） |
