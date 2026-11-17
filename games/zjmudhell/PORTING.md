# 指尖MUD（地狱） — 移植说明

上游：[fluffos/mudlibs](https://github.com/fluffos/mudlibs) 的 `libs/zjmudhell/work`（commit 06db5f0）。"地狱"/Doing 家族的门派世界，搬到了一套独立开发的手机客户端引擎上。上游的原始说明见 [UPSTREAM_README.md](UPSTREAM_README.md)。

fluffos/mudlibs 已经把源码转成 UTF-8 并修好了 FluffOS 下的编译问题（文件扩展名是 `.lpc`），但它的在线版把手机按钮界面换成了文字提示，实际玩不了。本仓库改用书剑江湖（`games/zjmud`）的按钮式网页客户端，并修了登录相关的问题。

配置文件 `mudlib/config.zj`：telnet 40204（compose 里映射到 8088），WebSocket/网页 8087。角色出生在世外桃源。

## 登录协议
和书剑江湖相同的指间手机协议：服务器先发 `ver1.0,<密文>`，客户端回握手串；然后发 `id║密码║key║邮箱`，新账号收到 `0008` 后发 `性别║头像║昵称`，`0007` 表示登录成功。请用浏览器访问，网页客户端会自动完成这些步骤。

## mudlib 改动
- `adm/daemons/logind.lpc`：增加网页握手 `zjmDMaIpOvxdb`（跳过原 App 的 crypt 挑战和 key 校验）；已有账号登录时校验密码（原代码不校验，任何密码都能登录并覆盖原密码）。
- `clone/user/user.lpc`：`restore()` 里的存档完整性校验（`sec_id`）在 WASM 驱动下约一半概率误判，导致重新登录提示"人物存档出现问题"。已改为只记录、不拒绝登录。
- 删除上游自带的玩家存档、备份、日志、Windows 驱动和压缩包；补建 `log/` 下代码会写入的子目录（缺 `log/nosave` 会导致登录失败）。
- `adm/etc/wizlist` 清空；`data/securityd.o` 里上游巫师 ranger 的权限已清空。
- `mudlib/config.zj` 由上游 `config.fluffos` 改写：mudlib 目录改为 `/mudlib`，增加 WebSocket 端口和网页目录。

## 网页客户端
`www/` 复制自 `games/zjmud/www`，只改了标题。相对书剑江湖原版客户端的改动见 `games/zjmud/PORTING.md`，另外几项是这次一起修的，五个指间游戏共用：
- 自动登录信息按游戏路径分开保存（`zjStore`），同一个站点上的几个游戏不会串号。
- 登录前收到"登录成功"提示不再当作错误清掉自动登录，刷新后可以直接进游戏。
- 协议码前面的 ANSI 颜色码在解析前去掉。
