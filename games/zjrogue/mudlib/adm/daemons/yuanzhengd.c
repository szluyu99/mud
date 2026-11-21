// 江湖远征 P1：单人局内状态与天赋数据。
#include <ansi.h>

#define MAX_TASK 5
#define MAX_LIFE 3

mapping *tasks = ({
    (["kind":"剿匪", "title":"清剿扬州匪徒", "room":"/d/city/guangchang", "hint":"前往扬州广场完成清剿" ]),
    (["kind":"寻访", "title":"寻访扬州武庙", "room":"/d/city/wumiao", "hint":"前往扬州武庙完成寻访" ]),
    (["kind":"夺宝", "title":"夺回客店秘宝", "room":"/d/city/kedian", "hint":"前往扬州客店完成夺宝" ]),
    (["kind":"护送", "title":"护送商队出城", "room":"/d/city/northgate", "hint":"前往扬州北门完成护送" ]),
    (["kind":"探查", "title":"探查城西旧宅", "room":"/d/city/xiuxishi", "hint":"前往扬州西侧完成探查" ])
});

mapping *talents = ({
    (["name":"铁骨", "desc":"气血上限 +120", "key":"max_qi", "value":120]),
    (["name":"轻身", "desc":"闪避 +12", "key":"dodge", "value":12]),
    (["name":"破甲", "desc":"攻击 +12", "key":"attack", "value":12]),
    (["name":"护体", "desc":"防御 +12", "key":"defense", "value":12]),
    (["name":"刀枪不入", "desc":"护甲 +25", "key":"armor", "value":25]),
    (["name":"力拔山河", "desc":"伤害 +15", "key":"damage", "value":15]),
    (["name":"凝神", "desc":"精力上限 +100", "key":"max_jingli", "value":100]),
    (["name":"气海", "desc":"内力上限 +120", "key":"max_neili", "value":120]),
    (["name":"根骨", "desc":"根骨 +2", "key":"con", "value":2]),
    (["name":"身法", "desc":"身法 +2", "key":"dex", "value":2]),
    (["name":"悟性", "desc":"悟性 +2", "key":"int", "value":2]),
    (["name":"膂力", "desc":"膂力 +2", "key":"str", "value":2]),
    (["name":"招架精通", "desc":"招架 +12", "key":"parry", "value":12]),
    (["name":"内功护体", "desc":"防御 +20", "key":"defense", "value":20]),
    (["name":"先发制人", "desc":"攻击 +20", "key":"attack", "value":20]),
    (["name":"铜皮铁骨", "desc":"护甲 +40", "key":"armor", "value":40]),
    (["name":"狂战", "desc":"伤害 +25", "key":"damage", "value":25]),
    (["name":"回春", "desc":"气血上限 +220", "key":"max_qi", "value":220]),
    (["name":"灵台清明", "desc":"精力上限 +220", "key":"max_jingli", "value":220]),
    (["name":"深不可测", "desc":"内力上限 +220", "key":"max_neili", "value":220])
});

mapping state(object me) { return me->query_temp("yuanzheng"); }

void apply_talent(object me, mapping t)
{
    me->add_temp("apply/" + t["key"], t["value"]);
}

mapping task(object me) { mapping s = state(me); return s ? tasks[s["task"]] : 0; }

string status(object me)
{
    mapping s = state(me); mapping t;
    if (!s) return "尚未开始远征。";
    t = tasks[s["task"]];
    return sprintf("第%d/%d个任务：%s\n生命：%d/%d　属性点：%d\n当前天赋：%d个　远征声望：%d",
        s["task"] + 1, MAX_TASK, t["title"], s["life"], MAX_LIFE,
        s["points"], sizeof(s["talents"]), me->query("yuanzheng/prestige"));
}

int on_die(object me)
{
    mapping s = state(me);
    if (!s) return 0;
    s["life"] -= 1;
    if (s["life"] <= 0) {
        tell_object(me, "你耗尽了远征的三条命，本局结束。\n");
        me->delete_temp("yuanzheng");
        return 0;
    }
    me->set_override("die", (: call_other, __FILE__, "on_die" :));
    me->revive(1);
    me->set("qi", me->query("max_qi"));
    me->set("eff_qi", me->query("max_qi"));
    me->set("jing", me->query("max_jing"));
    me->set("eff_jing", me->query("max_jing"));
    me->move("/d/city/kedian");
    me->set_temp("yuanzheng", s);
    tell_object(me, "你在远征中倒下了！还剩 " + s["life"] + " 条命，已回到安全地点。\n");
    return 1;
}

int start(object me)
{
    mapping s;
    if (state(me)) return notify_fail("你已经在远征途中。\n");
    s = (["task":0, "life":MAX_LIFE, "points":0, "talents":({}), "started":time()]);
    me->set_temp("yuanzheng", s);
    me->set_override("die", (: call_other, __FILE__, "on_die" :));
    tell_object(me, "你踏上了江湖远征。\n" + tasks[0]["title"] + "：" + tasks[0]["hint"] + "。\n");
    return 1;
}

int complete(object me)
{
    mapping s = state(me), t; object env;
    if (!s) return notify_fail("你还没有开始远征。\n");
    if (s["task"] >= MAX_TASK) return notify_fail("本局远征已经完成，请结算。\n");
    t = tasks[s["task"]]; env = environment(me);
    if (!env || base_name(env) != t["room"])
        return notify_fail(t["hint"] + "。\n");
    s["points"] += 1;
    s["task"] += 1;
    me->set_temp("yuanzheng", s);
    if (s["task"] >= MAX_TASK) {
        tell_object(me, "任务完成！五项远征任务全部完成，请输入 yuan zheng settle 结算。\n");
        return 1;
    }
    tell_object(me, "任务完成！获得 1 点属性点。\n" + tasks[s["task"]]["title"] + "：" + tasks[s["task"]]["hint"] + "。\n");
    return 1;
}

int choose(object me, int n)
{
    mapping s = state(me), t;
    if (!s) return notify_fail("你还没有开始远征。\n");
    if (s["points"] < 1) return notify_fail("你没有可用的属性点。\n");
    if (n < 1 || n > 3) return notify_fail("请选择 1、2 或 3。\n");
    t = talents[(s["task"] * 3 + n - 1) % sizeof(talents)];
    apply_talent(me, t); s["talents"] += ({ t["name"] }); s["points"] -= 1;
    me->set_temp("yuanzheng", s);
    tell_object(me, "你选择了天赋【" + t["name"] + "】：「" + t["desc"] + "」。\n");
    return 1;
}

int settle(object me)
{
    mapping s = state(me); int gain;
    if (!s) return notify_fail("你还没有开始远征。\n");
    if (s["task"] < MAX_TASK) return notify_fail("还有任务未完成。\n");
    gain = 5 + s["points"];
    me->add("yuanzheng/prestige", gain);
    tell_object(me, "远征结算完成！获得远征声望 " + gain + " 点。局内天赋与属性不会带回普通江湖。\n");
    me->delete_temp("yuanzheng");
    return 1;
}
