# 书剑江湖（指间争锋）— 移植说明

上游：[MudRen/zjmud](https://github.com/MudRen/zjmud)，`main` 分支（GBK，原本跑在 Windows 版 FluffOS 2017 + node socket.io 代理上）。配置文件 `mudlib/config.zj`：telnet 3000（compose 里映射到 8086），WebSocket/网页 8085。

## 登录协议
登录时客户端要先发握手串，网页客户端已经处理好，所以请用浏览器访问。telnet 直连需要先发 `zjmDMaIpOvxdb`，再发 `id║密码║key║邮箱`。

## mudlib 改动
1. GB18030 → UTF-8，CRLF → LF（`scripts/conv.py`）；`.o` 存档只转编码、保留 `\r`（`scripts/convo.py`）。
2. `static` → `protected` / `nosave`（`scripts/fixstatic.py`）；按字符串调用的函数去掉 `private`（`scripts/fixpriv.py`）。
3. `include/globals.h`：注释掉 `#define nosave static`。
4. `adm/simul_efun/message.c`：`message()` 对空的 exclude / target 做保护（否则报 "Bad argument 4 to EFUN message()"）。
5. `adm/simul_efun/chinese.c` 的 `is_chinese()` 按 Unicode CJK 码点判断；`logind.c` 名字长度按 UTF-8 字符计算。
6. `adm/single/master.c` 的 `log_error`：跳过编译警告。
7. 删除上游自带的 741 个真实玩家存档以及百宝箱、装备、排行、VIP、改名、帮派仇恨等运行数据；补建 `log/`、`data/` 子目录（缺 `log/static` 会导致登录失败）。
8. `adm/etc/wizlist` 清空（原有上游巫师 ranger、sxjian）。

## 网页客户端改动
- 用 `www/sockshim.js` 代替 socket.io：浏览器直接用 WebSocket 连 FluffOS，连上后自动发送网页登录握手，并在字节层过滤 telnet IAC。
- `www/main.js` 不再调用外部账号接口 `fzcs.92mud.com/mud/api.php`，登录和注册直接发给 MUD；去掉手机号字段，邮箱可不填；关闭禁止打开开发者工具的代码。
- `www/index.html` 去掉 socket.io 和 md5 的 CDN 引用及 gb2312 字符集声明。
- 充值、主页两个按钮仍指向原站 92mud.com；`adm/daemons/payd.c` 的充值回调白名单是原站服务器 IP，本地部署不会生效。

## 后续修正
- `mudlib/clone/user/user.c`：`restore()` 的存档完整性校验（`sec_id`）在 WASM 驱动下会随机误判，改为只记录、不拒绝登录。
- `www/main.js`：自动登录信息按游戏路径分开保存；登录前的"登录成功"提示不再清掉自动登录；协议码前面的 ANSI 颜色码在解析前去掉；修正原版 `charcheck()();` 的笔误并在建角后关闭对话框。
- 新增自动师门：`adm/daemons/autoquestd.c`（每秒一个动作的状态机，广度优先找路 + 飞行落点）、`cmds/usr/autoquest.c`，网页「系统」菜单加「自动师门」按钮。
