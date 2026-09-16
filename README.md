# dsh-quiet-mode

给 DeepSeek Harness（dsh）的每一轮模型请求注入一条固定的作业纪律：

> 请\*\*保持静默，专注干活，不胡思乱想，不过度思考，不过度设计，不虚构历史，不清晰就询问，不猜测或假定目标，不创造名词概念，不使用缩写，坚持使用简体中文进行思考和回复\*\*

（`**` 按你的要求逐字保留。）

装上以后，这句话会出现在该 profile 下**每个会话、每一次模型请求**的系统提示词里——
不用每轮重新叮嘱，也不再会被后续对话挤掉。

想改注入的文本，或者想了解它内部的实现方式，见 [DEVELOPMENT.md](DEVELOPMENT.md)。

## 环境要求

- 终端里能运行 `dsh`（`dsh --version` 有输出）
- Node.js 22.19 以上，或 24 以上

## 安装

先把仓库克隆到本地（放哪个目录由你决定），再进到克隆出来的目录里安装：

```sh
git clone https://github.com/viyiviyi/dsh-quiet-mode.git
cd dsh-quiet-mode
dsh plugin --profile web add .
```

命令会把包写进 `$DSH_HOME/profiles/web`，并自动把 `dsh-quiet-mode` 追加进 `dsh.profile.bundles`
（因为它的 `package.json` 声明了 `dsh.bundle.patch`）。

检查这一层有没有挂上（输出里应该出现 `quiet-mode`）：

```sh
dsh --profile web --dump-config
```

## 生效

**插件在 `dsh` 启动时加载，装完必须重启 `dsh web`。**

重启后新开的会话就会带上这句话；已经开着的旧会话不会追溯生效。

## 配置

默认文本和开关写在 `lib/index.js` 里。要改就在**你自己的** profile 配置层覆盖，不要改包内的
`cordis.patch.yml`——那份文件会随包更新被覆盖。

编辑 `$DSH_HOME/profiles/web/cordis.patch.yml`：

```yaml
- id: quiet-mode
  config:
    enabled: true            # 设为 false 可临时关掉，不注册任何段落
    text: '自定义的纪律文本'   # 留空或不写则用默认整句
```

profile 这一层的优先级高于 bundle 层；按行覆盖时 `config` 是**整体替换**，不是逐字段深合并，
所以覆盖时要把想保留的字段一起写全。改完同样要重启 `dsh web`。

## 卸载

```powershell
dsh plugin --profile web remove dsh-quiet-mode
```

## 许可

[MIT](LICENSE)
