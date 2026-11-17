# mud — 移植到 FluffOS 的老中文 MUD 合集

四个经典中文 MUD，已从 GBK / MudOS 时代的代码移植到当前的 [FluffOS](https://github.com/fluffos/fluffos) 驱动：源码统一转成 UTF-8，修好了新驱动下的编译和运行问题，并配好浏览器客户端。克隆后用 Docker 就能直接跑，不需要再做任何转换。也可以直接在浏览器里玩单机版：<https://szluyu99.github.io/mud/>。

| 目录 | 游戏 | 上游仓库 | 网页端口 | telnet 端口 |
|---|---|---|---|---|
| `games/jy` | 金庸群侠传 | [mudchina/jy](https://github.com/mudchina/jy) | 8081 | 4000 |
| `games/es2` | 东方故事 II | [mudchina/es2-utf8](https://github.com/mudchina/es2-utf8) | 8082 | 4100 |
| `games/xyj` | 西游记 2006 | [mudchina/xyj2006](https://github.com/mudchina/xyj2006) | 8083 | 8084 |
| `games/zjmud` | 书剑江湖（指间争锋） | [MudRen/zjmud](https://github.com/MudRen/zjmud) | 8085 | 8086 |

每个游戏的网页端口同时提供 WebSocket 和网页客户端，浏览器打开 `http://<主机>:<网页端口>/` 会自动连接。zjmud 是按钮式手机界面，登录必须走网页客户端；其余三个也可以用 telnet 客户端直连。

## 浏览器单机版（无需服务器）

**在线游玩：<https://szluyu99.github.io/mud/>**

FluffOS 官方的 WebAssembly 驱动可以把整个 MUD 跑在浏览器标签页里。单机版把四个游戏的 mudlib 打包成静态文件，用 GitHub Pages 发布，打开网页就能玩，不需要任何服务端。

- 存档保存在浏览器的 IndexedDB 里，刷新或关闭页面不会丢。换浏览器、清理网站数据会丢，所以页面右下角提供「导出存档 / 导入存档」，可以备份成 JSON 文件；「重置」清空当前游戏的存档。
- 第一次打开要下载驱动（约 4 MB）和 mudlib（es2 0.8 MB、jy 1.2 MB、xyj 6.4 MB、zjmud 2.9 MB），启动需要 1–2 秒。
- 只有你一个玩家，聊天频道里没有别人；需要网络或 socket 的功能（ftpd、跨站频道等）不可用，启动日志里相关报错可以忽略。
- 地址后加 `?debug=1` 会把服务器输出打印到浏览器控制台，方便排查。

本地构建和预览：

```bash
gh release download v2026.1101.0 -R fluffos/fluffos -p '*wasm.zip'
unzip -j fluffos-*-wasm.zip '*fluffos.js' '*fluffos.wasm' -d web/driver
node web/build.mjs --driver web/driver --out site   # 需要 Node 18+
python3 -m http.server -d site 8000                 # 打开 http://localhost:8000/
```

推送到 `main` 后，`.github/workflows/pages.yml` 会自动构建并发布到 GitHub Pages。`web/` 下是单机版的代码：`pack.mjs` 把 mudlib 打成一个 gzip 包，`mudwasm.js` 负责加载驱动、解包到内存文件系统、同步 IndexedDB，并提供一个 WebSocket 形状的接口给原来的网页客户端，`build.mjs` 生成整个站点。

## 服务器部署

需要 Docker（带 compose 插件）。

```bash
git clone https://github.com/szluyu99/mud.git && cd mud

# 1. 构建 FluffOS 驱动镜像（只需一次，约 5–10 分钟）
docker build -t fluffos-mud -f docker/Dockerfile docker

# 2. 启动全部游戏，或只启动其中一个
UID=$(id -u) GID=$(id -g) docker compose up -d
UID=$(id -u) GID=$(id -g) docker compose up -d zjmud
```

容器以当前用户身份运行，玩家存档写入 `games/<游戏>/mudlib/data/`，日志写入 `games/<游戏>/mudlib/log/`。改了 LPC 代码后 `docker compose restart <游戏>` 即可生效。

不用 compose 时，单独启动一个游戏：

```bash
docker run -d --name zjmud --restart unless-stopped --user $(id -u):$(id -g) \
  -p 8086:3000 -p 8085:8085 \
  -v $PWD/games/zjmud/mudlib:/mudlib -v $PWD/games/zjmud/www:/fluffos/www:ro \
  fluffos-mud /mudlib/config.zj
```

### 内网 / 代理环境

构建时要从 GitHub 下载 FluffOS 源码、从 Alpine 源装包。需要代理或镜像时：

```bash
docker build --network host -t fluffos-mud -f docker/Dockerfile \
  --build-arg BASE=<镜像仓库>/alpine:3.18 \
  --build-arg http_proxy=$http_proxy --build-arg https_proxy=$https_proxy \
  docker
```

- 基础镜像请用 Alpine 3.18。3.19 起部分静态库包名有变化，静态链接会失败。
- 驱动版本由 Dockerfile 里的 `FLUFFOS_REF` 固定（2026-11-13 的 master），可以按需修改。
- 拿不到仓库时可以下载 tar 包：`curl -L https://codeload.github.com/szluyu99/mud/tar.gz/refs/heads/main | tar xz`。

## 目录结构

```
docker/Dockerfile        FluffOS 驱动镜像（静态链接，4 个游戏共用）
docker-compose.yml       4 个游戏的容器定义
games/<游戏>/mudlib/     移植后的 mudlib，含 FluffOS 配置文件 config.*
games/<游戏>/www/        网页客户端（由 FluffOS 的 websocket http dir 提供）
games/<游戏>/PORTING.md  该游戏的移植改动和注意事项
scripts/                 移植用的转换脚本（已经跑过，仅供参考）
web/                     浏览器单机版（WASM）的构建脚本和运行时
.github/workflows/       GitHub Pages 自动发布
```

## 移植时改了什么

所有游戏都做过的通用修改：

1. 源码 GB18030 → UTF-8，CRLF → LF；`.o` 存档只转编码，保留其中的 `\r`。
2. FluffOS 已移除 `static` 关键字：函数改为 `protected`，变量改为 `nosave`。
3. 被驱动按字符串回调的 `private` 函数（`call_out`、`input_to`、`add_action`、`command_hook`、`net_dead` 等）去掉 `private`，否则命令无效或断线重连异常。
4. `is_chinese()` 改为按 Unicode CJK 码点判断；中文名长度检查从 GBK 字节数改为字符数。
5. master 的 `log_error` 不再把编译警告显示给玩家。
6. 补齐 `log/`、`data/` 下缺失的目录（缺目录会导致登录写日志失败）。
7. 删除上游仓库自带的真实玩家存档、留言板、帮派排行等运行数据，每个游戏都从空服开始。

各游戏的专项改动见 `games/<游戏>/PORTING.md`，主要有：

- **xyj**：去掉"只允许 Tomud 客户端"的登录限制；网页客户端过滤 Tomud 的 `\x19…\x1A` 界面指令；简繁转换守护进程改为直通；`#include </绝对路径>` 改为 `#include "/绝对路径"`。
- **zjmud**：原版的 node socket.io 代理换成 `www/sockshim.js`，浏览器直接用 WebSocket 连 FluffOS；去掉了登录/注册时对外部账号接口 92mud.com 的调用；修正 `message()` 对空参数的处理。页面上的充值、主页按钮仍指向原站。

## 游戏提示

- **jy / es2**：按提示输入英文 ID 和密码即可创建角色。
- **xyj**：注册时输入 `new`；英文 ID 只能用字母；"管理密码"至少 7 位，需要同时含大写字母、小写字母和数字或标点。
- **zjmud**：在网页上注册；角色出生在世外桃源，按提示选天性、选属性后到扬州。

仓库里没有配置巫师（管理员）账号。需要时自己注册角色后，在对应游戏的 `mudlib/adm/etc/wizlist` 里加一行 `<id> (admin)`，然后重启该游戏。

原仓库的 wizlist 里有上游作者的巫师 ID（如 zhg、akai、ranger），在开放注册的服务器上谁先注册这些 ID 谁就是管理员，所以本仓库已清空。

## 来源与版权

游戏内容来自上表中的上游仓库，版权归原作者所有。本仓库只做了驱动移植、编码转换和部署配置，供学习和怀旧使用，请勿用于商业运营。FluffOS 驱动按其自身许可证在构建时下载。
