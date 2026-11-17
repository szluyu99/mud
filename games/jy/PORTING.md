# 金庸群侠传 — 移植说明

上游：[mudchina/jy](https://github.com/mudchina/jy)（GBK，自带 MudOS v21.7 Win32 驱动，未使用）。配置文件 `mudlib/config.jy`：telnet 4000，WebSocket/网页 8081。

## 改动
1. 全部源码 GB18030 → UTF-8，CRLF → LF；`data/*.o` 存档同样转码。
2. `static`：函数 → `protected`，变量 → `nosave`。
3. `adm/simul_efun/chinese.c` 的 `is_chinese()` 按 Unicode 码点判断（原来按 GBK 首字节 >160）。
4. `adm/daemons/logind.c` 中文名长度检查改为 1–6 个字符（原来按字节 2–12）。
5. `feature/command.c`：`command_hook` 去掉 `private`，否则所有命令都提示"什么？"。
6. `adm/{obj,single}/master.c` 的 `log_error`：编译警告不显示给玩家。
7. 删除 `data/login`、`data/user`（旧账号）和 `data/board`（二进制已损坏的留言板）。
8. 网页客户端 `www/index.html`：默认连当前页面的主机和端口，并自动连接。
