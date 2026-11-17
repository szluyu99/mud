# 西游记 2006 — 移植说明

上游：[mudchina/xyj2006](https://github.com/mudchina/xyj2006)（GBK，原本只支持 Tomud 客户端，自带 Win32 MudOS.exe 未使用）。配置文件 `mudlib/config.xyj`：telnet/Tomud 5555（compose 里映射到 8084），WebSocket/网页 8083。

## 改动
1. GB18030 → UTF-8，CRLF → LF（`.o` 存档保留 `\r`）；567 个文件里的残缺字节已删除；GBK 自造字（私用区）替换为"＼"。
2. `static` → `protected` / `nosave`，186 处。
3. 被 `call_out` / `input_to` / `add_action` 按字符串调用的 `private` 函数去掉 `private`，196 处；`obj/user.c` 的 `net_dead` 去掉 `private`（否则断线重连后人在虚空里）。
4. `#include </绝对路径>` → `#include "/绝对路径"`，5 个文件。
5. `adm/daemons/convertd.c` 改为直通（UTF-8 下不需要 GB/BIG5 转换）。
6. `adm/daemons/logind.c`：去掉"只允许 Tomud 客户端"的限制（Tomud 仍兼容）；中文名 1–6 字逐字检查。
7. `adm/simul_efun/chinese.c` 的 `is_chinese()` 按 Unicode CJK 码点判断。
8. `adm/obj/master.c`：编译警告不显示给玩家。
9. 补建 `data/` 下缺失的目录；删除上游自带的玩家存档、帮派、排行榜、掌门和留言板数据。
10. 网页客户端 `www/index.html` 过滤 Tomud 的 `\x19…\x1A` 界面指令，只显示 `ptext` 内容。

## 已知问题
- 部分房间文件的 include 路径错误（如 `jitan.h`、`banned.h`），进入这些房间会报错。只测试过长安城客栈一带。

## 注册
输入 `new`；英文 ID 只能用字母；"管理密码"至少 7 位，需要同时含大写字母、小写字母和数字或标点。
