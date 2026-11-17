# 移植脚本

这些脚本已经对 `games/` 下的代码跑过，部署时不需要再运行。移植新的老 MUD 时可以参考。

| 脚本 | 作用 |
|---|---|
| `conv.py <dir>` | 文本文件 GB18030 → UTF-8，CRLF → LF（跳过二进制） |
| `convo.py` | `.o` 存档只转编码、保留 `\r`（存档里 `\r` 是字符串内容）。脚本里的源/目标路径需按实际修改 |
| `fixstatic.py <dir>` | 去掉 FluffOS 已移除的 `static`：函数 → `protected`，变量 → `nosave` |
| `fixpriv.py <dir>` | 被 `call_out` / `input_to` / `add_action` 按字符串调用的 `private` 函数去掉 `private` |
| `mudclient.py cmd...` | 简单 telnet 测试客户端（默认连 127.0.0.1:8084，`W` 环境变量控制每条命令的等待秒数） |
