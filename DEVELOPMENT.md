# dsh-quiet-mode 开发说明

面向要改这个插件的人。使用与配置见 [README.md](README.md)。

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

## 目录结构

| 文件 | 职责 |
|---|---|
| `package.json` | 包声明与 `dsh.bundle.patch` 指向 |
| `cordis.patch.yml` | bundle 配置层：把 `quiet-mode` 行插入插件列表 |
| `lib/index.js` | 插件入口：Config schema、段落注册 |
| `README.md` | 面向使用者的安装、配置、卸载 |
| `DEVELOPMENT.md` | 本文件，面向开发者 |
| `verify.mjs` | 本地验证脚本（不发布） |

`verify.mjs`、`DEVELOPMENT.md`、`.gitignore` 都不在 `package.json` 的 `files` 白名单里，不随包发布。

## 本地验证

**插件在启动时加载，改完必须重启 `dsh web` 才会生效。**

重启前可以先用本地验证脚本确认插件本身没问题（不依赖 dsh 进程）。
在克隆出来的插件目录里执行：

```powershell
node verify.mjs
```

脚本做三类检查：注册契约（伪 ctx 断言注册了什么）、端到端（用真实 cordis + dsh-system-prompt
组装一次系统提示词并断言整句出现、且排在人设之后、且只出现一次）、生命周期（卸载插件行后段落被撤销）。

## 改完怎么生效

- 目录安装走的是 `link:`（junction 指向源码目录），所以改完源码重启 `dsh web` 即可，不必重新 `add`。
  如果哪天它变成 `file:` 说明（或复制安装），就要 `remove` 再 `add`，否则跑的还是旧代码。
- 要更新到远端最新提交：在克隆目录里 `git pull`，然后重启 `dsh web`。

## 已知问题

### `ERR_PNPM_ADDING_TO_ROOT`

pnpm 的 `add` 在 cwd 就是 workspace 根时会拦下命令，但**仅当** profile 的 `pnpm-workspace.yaml`
里 `packages` 不止一项。pnpm 源码里的条件就是这个：

```js
if (!opts.recursive && opts.workspaceDir === opts.dir && !opts.ignoreWorkspaceRootCheck &&
    !opts.workspaceRoot && opts.workspacePackagePatterns &&
    opts.workspacePackagePatterns.length > 1) {
  throw new PnpmError("ADDING_TO_ROOT", ...)
}
```

`dsh plugin` 把 pnpm 的 cwd 固定成 profile 目录，而 profile 目录本身就是 workspace 根，所以
`packages` 一旦多于一项，**任何** `add` 都会被拦下——本地目录、`.`、`git+` 地址、zip 归档地址
一视同仁，与装的是哪个插件无关。两种修法：

- 在 `pnpm-workspace.yaml` 里加一行 `ignoreWorkspaceRootCheck: true`（实测有效）；
- 或者把 `packages` 收敛成只有 `- .` 一项（dsh 新建的 profile 就是这个形态）。

### 直接装 `git+` 地址

git 托管的插件要靠 `prepare` 脚本在安装时构建，pnpm 默认拦下，会要求手工把 key 加进
`pnpm-workspace.yaml` 的 `allowBuilds`。装本地目录没有这一步，所以 README 用克隆后安装目录。

### 绕开 `dsh plugin add`

`dsh plugin add` 只是把参数转给 profile 目录里的 pnpm，所以 pnpm 拦得住它。`pnpm install` 和
`npm install` 都不触发 `ADDING_TO_ROOT`（那个检查只写在 `add` 命令的 handler 里），
所以在 profile 目录里执行：

```sh
npm install <插件目录的绝对路径> --save
```

同样能装成本地依赖。代价是它不经过 `dsh` 的 `reconcilePlugins`，`dsh.profile.bundles` 不会
自动登记，要自己往 profile 的 `package.json` 里补上 `dsh-quiet-mode`。已验证：手写之后
`dsh --profile <name> --dump-config` 会输出 `# == dsh-quiet-mode` 那一层。

## 开发环境提示

- `lib/index.js` 刻意**不 import 任何 `@deepseek-ai/*` 运行时包**。插件通常以 `link:` 指向克隆出来的
  源码目录，Node 会从源码目录往上找 `node_modules`，而宿主作用域的包只在 profile 的
  `node_modules` 里——解析不到就会让 `dsh` 在启动时直接失败：

  ```
  Cannot find package '@deepseek-ai/schemastery' imported from .../dsh-quiet-mode/lib/index.js
  ```

  所以配置项的默认值不放在 schemastery schema 里，而是由 `DEFAULT_CONFIG` + `apply()` 兜底。
  插件因此是零运行时依赖的，克隆下来即可加载，不需要 `npm install`。
- 包内的 `node_modules/@deepseek-ai` 是指向 `$DSH_HOME/profiles/node_modules/@deepseek-ai`
  的 junction，只为让 `node verify.mjs` 能在工作区里解析 `@deepseek-ai/cordis` 和
  `@deepseek-ai/dsh-system-prompt`（这两个只出现在验证脚本里，宿主加载插件时用不到）；
  它已在 `.gitignore` 里，也不会进发布产物。
