# 东方故事 II — 移植说明

上游：[mudchina/es2-utf8](https://github.com/mudchina/es2-utf8)（已是 UTF-8；自带的 2016 年驱动和 node webtelnet 代理未使用）。配置文件 `mudlib/config.es2`：telnet 4100，WebSocket/网页 8082。

## 改动
1. 配置改为 FluffOS 格式，删除已废弃的配置项。
2. `static` → `protected`（函数）/ `nosave`（变量），68 处。
3. `adm/simul_efun/chinese.c` 的 `is_chinese()` 按 Unicode CJK 码点判断。
4. `adm/daemons/logind.c` 中文名长度 1–6 字。
5. `adm/obj/master.c` 的 `log_error`：编译警告不显示给玩家。
6. 网页客户端连接地址带上页面路径，可以放在反向代理的子路径下（例如 nginx `location /es2/` 转发到 8082，需要带 WebSocket upgrade 头）。
