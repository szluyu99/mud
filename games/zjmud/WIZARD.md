# 书剑江湖 巫师命令手册（浏览器单机版）

## 怎样变成巫师

1. 先正常注册并登录一个角色，记住它的英文账号（ID）。
2. 点页面右上角 **存档 → 巫师**，输入 ID 和等级（默认 `admin`）。
3. 页面会自动存盘并刷新，重新登录后就是巫师。等级留空表示取消巫师。

`adm/etc/wizlist` 会和存档一起保存在浏览器里，导出/导入存档时也会带上。
在游戏里，admin 也可以用 `promote <ID> <等级>` 修改别人（或自己）的等级，下次登录生效。

等级从低到高：`immortal` < `apprentice` < `wizard` < `arch` < `admin`。下面每节标题里的等级是能用这一节命令的最低等级。

## 常用组合

| 想做什么 | 命令 |
| --- | --- |
| 瞬移到房间 | `goto /d/city/kedian`（扬州客栈）、`goto /d/city/guangchang`（中央广场） |
| 瞬移到某个玩家或已载入的 NPC | `goto <id>`，例如 `goto zuo quan`（对方必须已经在游戏里） |
| 给自己加经验、潜能、钱 | `call me->add("combat_exp",10000)`、`call me->add("potential",1000)`、`clone /clone/money/gold 10` |
| 设置技能等级 | `setsk <你的ID> force 100`，或 `wizlian force 100` |
| 查看/修改任意属性 | `call me->query("family")`、`call me->set("weiwang",100)` |
| 复制物品或 NPC | `clone <文件名> [数量]`，例如 `clone /d/city/npc/xiaoer2` |
| 删除物品或 NPC | `dest <id>` |
| 杀死眼前的 NPC | `smash5 <id>` |
| 复活/恢复 | `recover me` |
| 找 NPC 在哪 | `where <id>` |
| 改完代码重新编译 | `update here`、`update /d/city/kedian` |

## immortal 级

| 命令 | 用法 | 说明 |
| --- | --- | --- |
| goto | `goto [-i] <目标>` | 瞬移。目标可以是房间路径、玩家 ID、已载入的 NPC ID；`-i` 进入物件内部 |
| flyto | `flyto <目标>` | 飞到某个玩家/生物身边 |
| summon | `summon <玩家ID或文件名>` | 把玩家或已载入的物件召唤到身边（NPC 要写文件名） |
| recover | `recover <对象>` | 让对象“轮回”恢复状态 |
| edemote | `edemote [-d\|-p] <表情>` | 编辑表情动词；`-p` 只显示，`-d` 删除 |
| cpemote / rnemote | `cpemote <原> <新>` | 复制 / 改名表情动词 |

## wizard 级

文件和目录：

| 命令 | 用法 |
| --- | --- |
| cd / pwd / ls | `cd /d/city`、`pwd`、`ls [-l] [路径]` |
| cat / more | 看文件内容，`more` 分页（回车翻页，q 退出） |
| edit | `edit <文件>`，行编辑器 |
| mkdir / cp / mv / rm | 文件操作。写权限只在自己的目录 `/u/<你的ID>/` 下（先 `mkdir /u/<ID>`）；admin 可写全部 |
| find | `find <文件名或内容> in <目录> [-c]`，`-c` 按内容搜 |
| update | `update <文件\|here\|me\|玩家>`，重新编译 |
| home | 回自己的工作室（需要先建 `/u/<ID>/workroom.c`） |

物件与调试：

| 命令 | 用法 |
| --- | --- |
| clone | `clone <文件名> [数量]` |
| dest | `dest <物件或文件名>` |
| info / mem / ilist | 物件信息、内存占用、继承链，可以用 `here`、NPC ID |
| ff | `ff <物件> <函数>`，查函数定义在哪个文件 |
| which | `which <命令>`，查命令文件路径 |
| where | `where <人物或文件名>` |
| localcmds | 当前环境提供了哪些动作命令 |
| cost | `cost <命令>`，测命令耗时 |
| status | 驱动运行状态 |
| copyskill | `copyskill <对象> [to <目标>]`，复制武功 |
| smash5 | `smash5 <生物>`，雷劈 |
| weight | `weight light\|heavy\|origin`，调整自身负重 |
| chinese | `chinese <英文>==<中文>`，添加中英对照 |
| who1 / who2 / who3 | 在线玩家的精气神、位置、属性 |
| ip | 在线 IP 统计（单机版只有本机） |
| blk / unchblk | 关闭 / 恢复某玩家的频道 |

## arch 级

| 命令 | 用法 | 说明 |
| --- | --- | --- |
| call | `call <物件>-><函数>(<参数>, ...)` | 调用任意函数，物件可写 `me`、`here`、ID、文件名 |
| callouts | `callouts [函数名]` | 列出延时调用 |
| setsk | `setsk <玩家ID> <技能> <等级>` | 设置技能等级 |
| data | `data <-t\|-d> <玩家\|物件\|here>` | 看临时数据（-t）或永久数据（-d） |
| examine | `examine [-u] <玩家ID> \| -all` | 检查玩家数据是否异常 |
| gettop | `gettop` | 扫描全部玩家数据 |
| spy | `spy <玩家ID>` | 看先天/后天资质 |
| changename | `changename [-f] <玩家ID> <新名字>` | 改中文名 |
| register | `register <ID> <email>` | 登记玩家 |
| promote | `promote <玩家ID> <等级>` | 改巫师等级，等级写 `admin` 或 `(admin)` 都可以 |
| child | `child <文件名>` | 列出某文件的所有复制品 |
| cleanup | `cleanup <文件名>` | 清理物件 |
| cleartemp | `cleartemp <玩家ID>` | 清理玩家暂存档 |
| config | `config` | 查看/修改系统配置 |
| qinfo / qdel | `qinfo [任务]`、`qdel all\|<任务>` | 查看 / 删除系统任务 |
| log / endlog | `log <玩家>`、`endlog <玩家>` | 记录 / 停止记录玩家输入 |
| throw / free | `throw <ID> [时间] because <理由>`、`free <ID>` | 关禁闭 / 释放（不能关自己） |
| punish | `punish <玩家ID> <分项>` | 处罚 |
| possess | `possess <生物>` | 附身（只能附 euid 相同的对象） |
| board | `board` | 列出留言板（本游戏没有留言板） |
| sameip | `sameip <ID\|IP>` | 查同 IP 玩家 |
| version | `version` | 版本信息 |
| smash | `smash <生物>` | 同 smash5 |
| wizlock | `wizlock <等级>` | 只允许该等级以上登录。单机版慎用，锁了自己也进不来 |

## admin 级

| 命令 | 用法 | 说明 |
| --- | --- | --- |
| wizlian | `wizlian <武功或属性> <值>` | 直接把自己的技能/属性设到某值 |
| wizgo / sgo | `wizgo <目标>` | 同 goto；sgo 依赖地图，本游戏没有 |
| query | `query all \| <物件>` | 查数据库记录 |
| clear | `clear [-u] <物件>` | 清除数据库记录 |
| grant | `grant [-d\|-c] <玩家> <命令>...` | 给普通玩家授权单个巫师命令 |
| cpasswd | `cpasswd <ID> <新密码>` | 改玩家密码（忘记密码时用） |
| getuser | `getuser <玩家ID>` | 载入离线玩家 |
| auth | `auth` | 查看目录读写权限配置 |
| snoop | `snoop <某人>\|none` | 监听玩家 |
| f | `f <某人> <命令>` | 强迫 NPC/玩家执行命令 |
| recover / diecover | `recover <某人> [次数]` | 恢复死亡损失 |
| updatei / updateall | `updatei <文件>`、`updateall <目录> [1]` | 连同继承文件一起编译 / 编译整个目录 |
| edroomw | `edroomw` | 编辑所在房间（帮派/私宅用） |
| afk | `afk` | 挂机任务菜单（打铁、抄书） |
| profile | `profile` | 性能分析，结果写到 /PROFILE |
| rinemote | `rinemote` | 批量替换表情文字 |
| sname | `sname` | 重建名字索引和排行榜 |
| spend | `spend <ID> <金额>` | 记一笔消费（金额要带小数点，如 `1.0`） |
| sump | `sump` | 统计充值记录（单机版没有记录） |
| shutdown / reboot | | 关闭驱动。单机版会让页面断开，刷新即可 |

## 单机版里没有意义或不能用的命令

| 命令 | 原因 |
| --- | --- |
| paym、sump、spend | 原站的充值系统，单机版没有支付 |
| telnet、ban、kickout、purge、restore、reclaim | 依赖网络连接、多人在线或服务器备份 |
| sbb、shell、shome、sitem、slog、suser | 原站合服时给存档加服务器后缀的工具，单机版后缀为空，不要用 |
| fcrypt、build、diejia、sp、sp2、p2、smash | 原站的加密/测试脚本，没有实际用途 |

## 本次修正

- `goto`、`tell`、`who` 等调用网络精灵时报 `socket_create` 未定义：网络精灵在没有 socket 时直接跳过。
- `cpemote`、`rnemote` 报 `socket_create`：版本精灵同样跳过 socket。
- `gettop`、`sameip`、`find` 的进度条报 `Index out of bounds`：进度条的空白串在编码转换时被压短了，改回 50 个空格。
- `dest`、`localcmds`、`grant`、`query`、`possess` 提示“你不能……”：原站要用不存在的密码命令激活管理员标记，现在 wizlist 里的 admin 自动有效。
- `board`、`sump` 在没有数据目录/文件时报错：加了判断。
- sbb 等 6 个合服工具编译失败（`ZJGAMEPART` 未定义）：补了空的定义，能编译但不建议使用。
- `promote <ID> admin` 不认不带括号的等级：两种写法都接受。

## 金手指（不用当巫师）

单机版加了一个普通玩家也能用的金手指：底部「系统」→「金手指」，或输入 `jinshouzhi`。出生后才能用。

| 按钮 | 效果 |
|---|---|
| 元宝 +1000 / +10000 | 直接加元宝，可在 `myshop` 元宝商店买道具 |
| 黄金 +100 / +1000 | 发到背包（大额会折成银票） |
| 经验 +1万 / +10万、潜能 +1万 | 加经验、潜能 |
| 阅历 +1000、威望 +100、贡献 +1000 | 师门任务等的门槛数值 |
| 内力上限 +500、精力上限 +500 | 加上限并回满 |
| 技能 +10级 | 已学会的所有技能各提高 10 级 |
| 状态回满 | 气血、精神、内力、精力、食物、饮水回满 |

也可以直接输入，例如 `jinshouzhi yuanbao 50000`、`jinshouzhi exp 1000000`。

## 自动师门

底部「系统」→「自动师门」，或输入 `autoquest`，再点一次停止。`autoquest status` 看进度。出生并拜师后才能用。

它按正常玩法替你做师门任务，每秒做一个动作，屏幕上会看到全部过程：

- 回师父那里领任务（`quest <师父>`），路远时先走到户外再飞行（`fly`），最后步行找到目标；目标走动了会重新找路。
- 送信（经验三万以下）：把信交给收信人，拿回执回去复命，接着领下一个。
- 追杀（经验五万以上）：第一次会先向师父请求出去历练；带着弓（例如新人礼包的盘龙弓）时会拿弓射箭，没有弓或箭就用普通招式。杀掉后会接受飞鸽送来的下一个任务。
- 气血低时运功恢复，太低就撤退休息；饿了渴了自动吃喝。

会自动停下的情况：经验在三万到五万之间（师父不派任务）、没有拜师、死亡、找不到路或目标、师父一直不给任务（阅历、威望或本周次数不够）。
