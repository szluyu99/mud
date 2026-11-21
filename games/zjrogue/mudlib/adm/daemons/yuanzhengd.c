// 江湖远征 P1：单人局内状态、五个任务与天赋。
// 局内天赋只在本局有效：apply/* 走临时加成，max_* 走 dbase 并在结算时减回去。
#include <ansi.h>

#define MAX_TASK 5
#define MAX_LIFE 3
#define BACK_ROOM "/d/city/kedian"

mapping *tasks = ({
    (["kind":"剿匪", "title":"清剿扬州匪徒", "room":"/d/city/guangchang", "hint":"前往扬州广场清剿匪徒"]),
    (["kind":"寻访", "title":"寻访扬州武庙", "room":"/d/city/wumiao", "hint":"前往扬州武庙寻访故人"]),
    (["kind":"夺宝", "title":"夺回客店秘宝", "room":"/d/city/kedian", "hint":"前往扬州客店夺回秘宝"]),
    (["kind":"护送", "title":"护送商队出北门", "room":"/d/city/beimen", "hint":"前往扬州北门护送商队"]),
    (["kind":"探查", "title":"探查扬州当铺", "room":"/d/city/dangpu", "hint":"前往扬州当铺探查线索"])
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

// 局内状态存在玩家身上，刷新/重新连接后还能接着打
mapping state(object me)
{
    mapping s;
    string k;
    int v;

    if (s = me->query_temp("yuanzheng")) return s;
    if (!mapp(s = me->query("yuanzheng/run"))) return 0;

    // 重新登录后临时加成会丢，按记录补回来；raw 的上限加成本来就存进了 dbase，不用再补
    if (mapp(s["buff"]))
        foreach (k, v in s["buff"]) me->add_temp(k, v);
    me->set_override("die", (: call_other, __FILE__, "on_die" :));
    me->set_temp("yuanzheng", s);
    return s;
}

void save_run(object me)
{
    mapping s = me->query_temp("yuanzheng");
    if (!s) me->delete("yuanzheng/run");
    else me->set("yuanzheng/run", s);
}

mapping task(object me)
{
    mapping s = state(me);
    return s ? tasks[s["task"]] : 0;
}

void apply_talent(object me, mapping t)
{
    mapping s = state(me);
    string key = t["key"];
    int v = t["value"];

    if (key[0..3] == "max_" || key == "con" || key == "dex" || key == "int" || key == "str")
    {
        me->add(key, v);
        s["raw"][key] = (s["raw"][key] || 0) + v;
    } else
    {
        me->add_temp("apply/" + key, v);
        s["buff"]["apply/" + key] = (s["buff"]["apply/" + key] || 0) + v;
    }
    me->set_temp("yuanzheng", s);
    save_run(me);
}

void end_run(object me)
{
    mapping s = state(me);
    string k;
    int v;

    if (!s) return;
    if (mapp(s["buff"]))
        foreach (k, v in s["buff"])
            me->add_temp(k, -v);
    if (mapp(s["raw"]))
        foreach (k, v in s["raw"])
            me->add(k, -v);
    me->delete_override("die");
    me->delete_temp("yuanzheng");
    me->delete("yuanzheng/run");
    // 上限降回来以后，当前值不能超过上限
    if (me->query("qi") > me->query("max_qi")) me->set("qi", me->query("max_qi"));
    if (me->query("eff_qi") > me->query("max_qi")) me->set("eff_qi", me->query("max_qi"));
    if (me->query("jing") > me->query("max_jing")) me->set("jing", me->query("max_jing"));
    if (me->query("eff_jing") > me->query("max_jing")) me->set("eff_jing", me->query("max_jing"));
    if (me->query("neili") > me->query("max_neili")) me->set("neili", me->query("max_neili"));
    if (me->query("jingli") > me->query("max_jingli")) me->set("jingli", me->query("max_jingli"));
}

string status(object me)
{
    mapping s = state(me), t;

    if (!s) return "尚未开始远征。";
    t = tasks[s["task"]];
    if (s["task"] >= MAX_TASK)
        return sprintf("五项任务已全部完成，可以结算。\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
            s["life"], MAX_LIFE, s["points"],
            sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
            me->query("yuanzheng/prestige"));
    return sprintf("第%d/%d个任务：%s（%s）\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
        s["task"] + 1, MAX_TASK, t["title"], t["hint"], s["life"], MAX_LIFE, s["points"],
        sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
        me->query("yuanzheng/prestige"));
}

// 每局只有三条命：倒下后不真死，回客店，命数减一
int on_die(object me)
{
    mapping s = state(me);

    if (!s) return 0;
    s["life"] -= 1;
    if (s["life"] <= 0)
    {
        tell_object(me, HIR "三条命都用完了，本局远征结束。局内天赋消散。\n" NOR);
        end_run(me);
        me->revive(1);
        me->set("qi", me->query("max_qi"));
        me->set("eff_qi", me->query("max_qi"));
        me->move(BACK_ROOM);
        return 1;
    }
    me->revive(1);
    me->set("qi", me->query("max_qi"));
    me->set("eff_qi", me->query("max_qi"));
    me->set("jing", me->query("max_jing"));
    me->set("eff_jing", me->query("max_jing"));
    me->move(BACK_ROOM);
    me->set_temp("yuanzheng", s);
    save_run(me);
    me->set_override("die", (: call_other, __FILE__, "on_die" :));
    tell_object(me, HIR "你在远征中倒下了！还剩 " + s["life"] + " 条命，已被送回客店。\n" NOR);
    return 1;
}

int start(object me)
{
    mapping s;

    if (state(me)) return notify_fail("你已经在远征途中，先结算或继续完成。\n");
    s = ([ "task":0, "life":MAX_LIFE, "points":0, "talents":({}),
           "buff":([]), "raw":([]), "started":time() ]);
    me->set_temp("yuanzheng", s);
    save_run(me);
    me->set_override("die", (: call_other, __FILE__, "on_die" :));
    tell_object(me, "你踏上了江湖远征，三条命，五个任务。\n" +
        tasks[0]["title"] + "：" + tasks[0]["hint"] + "。\n");
    return 1;
}

int complete(object me)
{
    mapping s = state(me), t;
    object env;

    if (!s) return notify_fail("你还没有开始远征，输入 yuanzheng start 开始。\n");
    if (s["task"] >= MAX_TASK) return notify_fail("五项任务都完成了，输入 yuanzheng settle 结算。\n");
    t = tasks[s["task"]];
    env = environment(me);
    if (!env || base_name(env) != t["room"])
        return notify_fail("你还没有到地方。" + t["hint"] + "。\n");
    s["points"] += 1;
    s["task"] += 1;
    me->set_temp("yuanzheng", s);
    save_run(me);
    if (s["task"] >= MAX_TASK)
    {
        tell_object(me, "任务完成！五项远征任务全部完成，得到 1 点属性点。输入 yuanzheng settle 结算。\n");
        return 1;
    }
    tell_object(me, "任务完成！获得 1 点属性点，可以输入 yuanzheng choose 1|2|3 选天赋。\n" +
        tasks[s["task"]]["title"] + "：" + tasks[s["task"]]["hint"] + "。\n");
    return 1;
}

int choose(object me, int n)
{
    mapping s = state(me), t;
    int base;

    if (!s) return notify_fail("你还没有开始远征。\n");
    if (s["points"] < 1) return notify_fail("你没有可用的属性点。\n");
    if (n < 1 || n > 3) return notify_fail("请选择 1、2 或 3。\n");
    base = (s["task"] < 1 ? 0 : s["task"] - 1) * 3;
    t = talents[(base + n - 1) % sizeof(talents)];
    apply_talent(me, t);
    s["talents"] += ({ t["name"] });
    s["points"] -= 1;
    me->set_temp("yuanzheng", s);
    save_run(me);
    tell_object(me, "你选择了天赋【" + t["name"] + "】：" + t["desc"] + "。\n");
    return 1;
}

int abandon(object me)
{
    mapping s = state(me);

    if (!s) return notify_fail("你还没有开始远征。\n");
    tell_object(me, "你放弃了这次远征，局内天赋已经消散。\n");
    end_run(me);
    return 1;
}

int settle(object me)
{
    mapping s = state(me);
    int gain;

    if (!s) return notify_fail("你还没有开始远征。\n");
    if (s["task"] < MAX_TASK) return notify_fail("还有任务没有完成，不能结算。\n");
    gain = 5 + sizeof(s["talents"]) + (s["life"] - 1) * 2;
    me->add("yuanzheng/prestige", gain);
    tell_object(me, "远征结算完成！完成 " + MAX_TASK + " 个任务，剩余 " + s["life"] +
        " 条命，获得远征声望 " + gain + " 点。局内天赋已经消散，不会带回普通江湖。\n");
    end_run(me);
    return 1;
}
