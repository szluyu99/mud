// 江湖远征 P2：五段有实际目标的关卡（剿匪、夺宝、寻访、截杀、终局），三条命，三选一天赋。
// 局内天赋只在本局有效：apply/* 走临时加成，max_* 与四维写 dbase 并在结算时减回去。
#include <ansi.h>

#define MAX_LIFE 3
#define BACK_ROOM "/d/city/kedian"
#define YZ_ENEMY "/kungfu/class/yuanzheng/enemy"
#define YZ_INFO "/kungfu/class/yuanzheng/informant"
#define YZ_TREASURE "/clone/misc/yz_treasure"

mapping *stages = ({
	([ "type":"kill", "title":"一、剿匪", "room":"/d/city/guangchang", "who":"恶汉", "eid":"ehan",
	   "hint":"去扬州广场，杀掉在那里闹事的恶汉（kill ehan）" ]),
	([ "type":"item", "title":"二、夺宝", "room":"/d/city/nandajie1", "who":"守卫", "eid":"shouwei",
	   "hint":"去南大街杀掉守卫，拿到他身上的宝物，再回宝昌客栈上交（yuanzheng submit）" ]),
	([ "type":"ask", "title":"三、寻访", "room":"/d/city/wumiao", "who":"线人", "eid":"xianren",
	   "hint":"去武庙找到线人，向他打听远征（ask xianren about 远征）" ]),
	([ "type":"kill", "title":"四、截杀", "room":"/d/city/beimen", "who":"副手", "eid":"fushou",
	   "hint":"去北门截杀匪首的副手（kill fushou）" ]),
	([ "type":"boss", "title":"五、终局", "room":"/d/city/guangchang", "who":"匪首", "eid":"feishou",
	   "hint":"回广场迎战匪首，赢下这一局（kill feishou）", "boss":1 ])
});

// ---- 开局构筑：三种流派，各有一套初始功夫与 15 个专属天赋 ----
mapping styles = ([
	"sword": ([ "name" : "剑客",
		    "desc" : "长剑在手，招架最稳，出手快，靠剑法连招取势",
		    "weapon" : "/clone/weapon/changjian",
		    "skills" : ([ "sword" : 70, "parry" : 50, "dodge" : 40, "force" : 30 ]) ]),
	"fist" : ([ "name" : "拳师",
		    "desc" : "空手对敌，身法最灵，贴身短打又快又狠",
		    "skills" : ([ "unarmed" : 80, "cuff" : 70, "dodge" : 60, "parry" : 40, "force" : 30 ]) ]),
	"blade": ([ "name" : "刀客",
		    "desc" : "单刀走刚猛一路，血厚甲硬，一刀是一刀",
		    "weapon" : "/clone/weapon/dadao",
		    "skills" : ([ "blade" : 70, "parry" : 40, "dodge" : 30, "force" : 40 ]) ])
]);

// 每个流派 5 关 x 3 选 1，按关卡顺序给，不重复
mapping talents = ([
	"sword" : ({
		([ "name":"起手式", "desc":"攻击 +12", "key":"attack", "value":12 ]),
		([ "name":"以逸待劳", "desc":"防御 +12", "key":"defense", "value":12 ]),
		([ "name":"养气", "desc":"气血上限 +120", "key":"max_qi", "value":120 ]),
		([ "name":"剑走轻灵", "desc":"闪避 +12", "key":"dodge", "value":12 ]),
		([ "name":"格挡", "desc":"招架 +14", "key":"parry", "value":14 ]),
		([ "name":"抢攻", "desc":"攻击 +16", "key":"attack", "value":16 ]),
		([ "name":"剑势", "desc":"伤害 +18", "key":"damage", "value":18 ]),
		([ "name":"卸力", "desc":"护甲 +25", "key":"armor", "value":25 ]),
		([ "name":"内力充盈", "desc":"内力上限 +150", "key":"max_neili", "value":150 ]),
		([ "name":"身法", "desc":"身法 +2", "key":"dex", "value":2 ]),
		([ "name":"膂力", "desc":"膂力 +2", "key":"str", "value":2 ]),
		([ "name":"根骨", "desc":"根骨 +2", "key":"con", "value":2 ]),
		([ "name":"万剑归宗", "desc":"攻击 +30", "key":"attack", "value":30 ]),
		([ "name":"无招胜有招", "desc":"伤害 +30", "key":"damage", "value":30 ]),
		([ "name":"心如止水", "desc":"气血上限 +260", "key":"max_qi", "value":260 ])
	}),
	"fist" : ({
		([ "name":"铁拳", "desc":"攻击 +14", "key":"attack", "value":14 ]),
		([ "name":"铁布衫", "desc":"护甲 +20", "key":"armor", "value":20 ]),
		([ "name":"桩功", "desc":"气血上限 +120", "key":"max_qi", "value":120 ]),
		([ "name":"游身", "desc":"闪避 +16", "key":"dodge", "value":16 ]),
		([ "name":"化劲", "desc":"招架 +12", "key":"parry", "value":12 ]),
		([ "name":"短打", "desc":"攻击 +18", "key":"attack", "value":18 ]),
		([ "name":"寸劲", "desc":"伤害 +20", "key":"damage", "value":20 ]),
		([ "name":"卸力", "desc":"防御 +20", "key":"defense", "value":20 ]),
		([ "name":"气沉丹田", "desc":"内力上限 +150", "key":"max_neili", "value":150 ]),
		([ "name":"身法", "desc":"身法 +2", "key":"dex", "value":2 ]),
		([ "name":"根骨", "desc":"根骨 +2", "key":"con", "value":2 ]),
		([ "name":"膂力", "desc":"膂力 +2", "key":"str", "value":2 ]),
		([ "name":"崩拳", "desc":"伤害 +32", "key":"damage", "value":32 ]),
		([ "name":"金刚不坏", "desc":"护甲 +50", "key":"armor", "value":50 ]),
		([ "name":"百炼成钢", "desc":"攻击 +30", "key":"attack", "value":30 ])
	}),
	"blade" : ({
		([ "name":"横刀", "desc":"攻击 +16", "key":"attack", "value":16 ]),
		([ "name":"厚甲", "desc":"护甲 +25", "key":"armor", "value":25 ]),
		([ "name":"血勇", "desc":"气血上限 +150", "key":"max_qi", "value":150 ]),
		([ "name":"刀风", "desc":"伤害 +16", "key":"damage", "value":16 ]),
		([ "name":"沉稳", "desc":"招架 +16", "key":"parry", "value":16 ]),
		([ "name":"力劈", "desc":"攻击 +20", "key":"attack", "value":20 ]),
		([ "name":"血战", "desc":"伤害 +22", "key":"damage", "value":22 ]),
		([ "name":"铁甲", "desc":"护甲 +35", "key":"armor", "value":35 ]),
		([ "name":"气海", "desc":"内力上限 +150", "key":"max_neili", "value":150 ]),
		([ "name":"膂力", "desc":"膂力 +2", "key":"str", "value":2 ]),
		([ "name":"根骨", "desc":"根骨 +2", "key":"con", "value":2 ]),
		([ "name":"身法", "desc":"身法 +2", "key":"dex", "value":2 ]),
		([ "name":"一刀两断", "desc":"伤害 +40", "key":"damage", "value":40 ]),
		([ "name":"浴血", "desc":"气血上限 +300", "key":"max_qi", "value":300 ]),
		([ "name":"刀山", "desc":"攻击 +34", "key":"attack", "value":34 ])
	})
]);


// ---- 局外成长：用远征声望买的常驻特权，每局开局生效 ----
mapping *perks = ({
	([ "id":"point", "name":"老练", "desc":"每局开局多 1 点属性点", "cost":30 ]),
	([ "id":"life",	 "name":"命硬", "desc":"每局多 1 条命", "cost":60 ]),
	([ "id":"atk",	 "name":"磨砺", "desc":"每局开局再加 10 点攻击", "cost":40 ]),
	([ "id":"gain",	 "name":"名望", "desc":"结算得到的声望 +20%", "cost":80 ])
});

int has_perk(object me, string id)
{
	return me->query("yuanzheng/perk/" + id) ? 1 : 0;
}

void shop(object me)
{
	string str;
	int i, owned;

	str = ZJOBLONG "远征商店（声望：" + me->query("yuanzheng/prestige") + "）\n"
		"这里的特权是常驻的，买到就一直生效，每局开局自动用上。\n"
		ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	for (i = 0; i < sizeof(perks); i++)
	{
		owned = has_perk(me, perks[i]["id"]);
		str += perks[i]["name"] + "（" + perks[i]["desc"] + "，" +
			(owned ? "已拥有" : perks[i]["cost"] + " 声望") + "）:" +
			(owned ? "yuanzheng shop" : "yuanzheng buy " + (i + 1)) + ZJSEP;
	}
	tell_object(me, str + "\n");
}

int buy(object me, int n)
{
	mapping p;
	int cost;

	if (n < 1 || n > sizeof(perks)) return notify_fail("没有这件特权。\n");
	p = perks[n - 1];
	if (has_perk(me, p["id"])) return notify_fail("你已经拥有了「" + p["name"] + "」。\n");
	cost = p["cost"];
	if (me->query("yuanzheng/prestige") < cost)
		return notify_fail("声望不够：需要 " + cost + "，你只有 " + me->query("yuanzheng/prestige") + "。\n");
	me->add("yuanzheng/prestige", -cost);
	me->set("yuanzheng/perk/" + p["id"], 1);
	tell_object(me, "你花 " + cost + " 点声望换到了「" + p["name"] + "」：" + p["desc"] + "。\n");
	return 1;
}

int debug_sp(object me, int n)
{
	if (wiz_level(me) < 5) return notify_fail("只有巫师能这么做。\n");
	if (n < 1) n = 10;
	me->add("yuanzheng/prestige", n);
	tell_object(me, "（调试）声望 +" + n + "，现在是 " + me->query("yuanzheng/prestige") + "。\n");
	return 1;
}

void create()
{
	seteuid(getuid());
	set_heart_beat(2);
}

// 玩家一到关卡地点就把目标放出来，避免目标在空房间里被别人打掉
void heart_beat()
{
	object me, env;
	mapping s, def;

	foreach (me in users())
	{
		if (! objectp(me) || ! me->query("born")) continue;
		if (! mapp(s = me->query("yuanzheng/run")) && ! mapp(s = me->query_temp("yuanzheng"))) continue;
		if (s["stage"] >= sizeof(stages)) continue;
		def = stages[s["stage"]];
		if (! objectp(env = environment(me))) continue;
		if (base_name(env) != def["room"]) continue;
		if (def["type"] == "ask")
		{
			if (! find_my_info(me)) spawn(me, s["stage"]);
			continue;
		}
		if (! find_my_enemy(me, s["stage"])) spawn(me, s["stage"]);
	}
}

mapping state(object me)
{
	mapping s;
	string k;
	int v;

	if (s = me->query_temp("yuanzheng")) return s;
	if (! mapp(s = me->query("yuanzheng/run"))) return 0;

	// 重新登录后临时加成会丢，按记录补回来；raw 的上限加成本来就存进了 dbase，不用再补
	if (mapp(s["buff"]))
		foreach (k, v in s["buff"]) me->add_temp(k, v);
	me->set_override("die", (: call_other, __FILE__, "on_die" :));
	me->set_temp("yuanzheng", s);
	// 局内武器在结算时会被收走，重登后按流派补一把，别让剑客空手上阵
	if (stringp(s["style"]) && mapp(styles[s["style"]]) &&
	    stringp(styles[s["style"]]["weapon"]) && ! has_weapon(me))
		give_weapon(me, styles[s["style"]]["weapon"]);
	return s;
}

void save_run(object me)
{
	mapping s = me->query_temp("yuanzheng");

	if (! s) me->delete("yuanzheng/run");
	else me->set("yuanzheng/run", s);
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

	if (! s) return;
	if (mapp(s["buff"]))
		foreach (k, v in s["buff"]) me->add_temp(k, -v);
	if (mapp(s["raw"]))
		foreach (k, v in s["raw"]) me->add(k, -v);
	clean_world(me);
	// 局内兵器是借的，结算/放弃时收回；留一句提示，免得玩家以为东西莫名没了
	foreach (object ob in all_inventory(me))
		if (ob->query("yz_weapon"))
		{
			destruct(ob);
			tell_object(me, "（局内借来的兵器已经还回去了）\n");
		}
	if (! undefinedp(s["wimpy"])) me->set("env/wimpy", s["wimpy"]);
	if (mapp(s["skills"]))
		foreach (string sk, int old in s["skills"]) me->set_skill(sk, old);
	me->delete_override("die");
	me->delete_temp("yuanzheng");
	me->delete("yuanzheng/run");
	if (me->query("qi") > me->query("max_qi")) me->set("qi", me->query("max_qi"));
	if (me->query("eff_qi") > me->query("max_qi")) me->set("eff_qi", me->query("max_qi"));
	if (me->query("jing") > me->query("max_jing")) me->set("jing", me->query("max_jing"));
	if (me->query("eff_jing") > me->query("max_jing")) me->set("eff_jing", me->query("max_jing"));
	if (me->query("neili") > me->query("max_neili")) me->set("neili", me->query("max_neili"));
	if (me->query("jingli") > me->query("max_jingli")) me->set("jingli", me->query("max_jingli"));
}

// ---------- 关卡 ----------

object find_my_enemy(object me, int stage)
{
	object ob;

	foreach (ob in children(YZ_ENEMY))
		if (ob && ob->query("yz_owner") == me->query("id") &&
		    ob->query("yz_stage") == stage)
			return ob;
	return 0;
}

object find_my_info(object me)
{
	object ob;

	foreach (ob in children(YZ_INFO))
		if (ob && ob->query("yz_owner") == me->query("id"))
			return ob;
	return 0;
}

void purge(object *obs)
{
	object ob;

	foreach (ob in obs)
		if (objectp(ob)) destruct(ob);
}

// 不能在 NPC 自己的调用栈里 destruct 它：ask/kill 这些命令返回后还要用这个对象，
// 当场销毁会报 "Bad argument 1 to EFUN call_other()"，玩家看到的就是默认错误提示。
void clean_world(object me, int stage)
{
	object ob, *kill = ({});

	foreach (ob in children(YZ_ENEMY))
		if (ob && ob->query("yz_owner") == me->query("id") &&
		    (stage < 0 || ob->query("yz_stage") == stage))
			kill += ({ ob });
	foreach (ob in children(YZ_INFO))
		if (ob && ob->query("yz_owner") == me->query("id"))
			kill += ({ ob });
	if (sizeof(kill)) call_out("purge", 1, kill);
}

mapping cur_stage(object me)
{
	mapping s = state(me);

	if (! s) return 0;
	if (s["stage"] < 0 || s["stage"] >= sizeof(stages)) return 0;
	return stages[s["stage"]];
}

void spawn(object me, int stage)
{
	mapping def = stages[stage];
	object room, ob;

	if (! objectp(room = load_object(def["room"]))) return;

	if (def["type"] == "ask")
	{
		ob = new(YZ_INFO);
		ob->set("yz_owner", me->query("id"));
		ob->move(room);
		message_vision(HIC "一个缩着脖子的人凑了过来，好像在等谁。\n" NOR, ob);
		tell_object(me, HIC "线人已经在了（ask xianren about 远征）\n" NOR);
		return;
	}

	ob = new(YZ_ENEMY);
	ob->setup_from(me, stage, def["boss"] ? "boss" : "kill", def["who"], def["eid"]);
	ob->move(room);
	message_vision(HIR "$N" HIR "横着走了过来，堵在你面前。\n" NOR, ob);
	tell_object(me, HIC "目标已出现：" + ob->query("name") + "（kill " + def["eid"] + "）\n" NOR);

}

int where(object me)
{
	mapping s = state(me), def;
	object env;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! mapp(def = cur_stage(me))) return notify_fail("五关已经打完了。\n");
	env = environment(me);
	write("stage=" + s["stage"] + " room=" + def["room"] +
	      " here=" + (env ? base_name(env) : "none") + "\n");
	return 1;
}

void begin_stage(object me)
{
	mapping s = state(me), def;
	object env;

	if (! s) return;
	if (s["stage"] >= sizeof(stages))
		return;
	def = stages[s["stage"]];
	// 开局就把目标放到地点上，玩家走过去就能打，不用等心跳
	if (def["type"] == "ask" ? ! find_my_info(me) : ! find_my_enemy(me, s["stage"]))
		spawn(me, s["stage"]);
	tell_object(me, HIR "【远征】" NOR + def["title"] + "：" + def["hint"] + "\n");
	if (objectp(env = environment(me)) && base_name(env) == def["room"])
		tell_object(me, HIC "目标就在此地。\n" NOR);
}

void talent_menu(object me)
{
	mapping s = state(me), t;
	mapping *pool;
	int i, base;
	string str;

	if (! s) return;
	base = (s["stage"] < 1 ? 0 : s["stage"] - 1) * 3;
	pool = talents[s["style"]];
	if (! arrayp(pool)) pool = talents["fist"];
	base = base % sizeof(pool);
	str = ZJOBLONG "选一个天赋（属性点：" + s["points"] + "）\n" ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	for (i = 0; i < 3; i++)
	{
		t = pool[(base + i) % sizeof(pool)];
		str += t["name"] + " " + t["desc"] + ":yuanzheng choose " + (i + 1) + ZJSEP;
	}
	tell_object(me, str + "\n");
}

void complete_stage(object me)
{
	mapping s = state(me), def = stages[s["stage"]];

	clean_world(me, s["stage"]);
	s["stage"] += 1;
	s["points"] += 1;
	me->set_temp("yuanzheng", s);
	save_run(me);

	tell_object(me, HIG "【远征】" + def["title"] + " 完成！得到 1 点属性点。\n" NOR);
	if (s["stage"] >= sizeof(stages))
	{
		tell_object(me, HIY "五关全部通过！输入 yuanzheng settle 结算这一局。\n" NOR);
		return;
	}
	talent_menu(me);
	begin_stage(me);
}

// 敌人被杀死
void enemy_died(object killer, object enemy)
{
	string id;
	object me;
	mapping s, def;

	if (! objectp(enemy)) return;
	id = enemy->query("yz_owner");
	if (! stringp(id)) return;
	if (! objectp(me = find_player(id))) return;
	if (! mapp(s = state(me))) return;
	if (enemy->query("yz_stage") != s["stage"]) return;

	if (mapp(def = cur_stage(me)) && def["type"] == "item")
	{
		object t = new(YZ_TREASURE);
		t->set("yz_stage", s["stage"]);
		t->move(me, 1);
		tell_object(me, HIY "你从守卫身上摸出一件宝物。带回宝昌客栈上交（yuanzheng submit）。\n" NOR);
		return;
	}
	complete_stage(me);
}

// 线人被打听
void ask_done(object me, object npc)
{
	mapping s = state(me), def;

	if (! s) return;
	if (! mapp(def = cur_stage(me))) return;
	if (def["type"] != "ask") return;
	complete_stage(me);
}

// 交宝物
int submit(object me)
{
	mapping s = state(me), def;
	object env, t;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! mapp(def = cur_stage(me)) || def["type"] != "item")
		return notify_fail("现在不需要上交东西。\n");
	env = environment(me);
	if (! env || base_name(env) != BACK_ROOM)
		return notify_fail("要把宝物带回宝昌客栈上交。\n");
	if (! objectp(t = present("treasure", me)))
		return notify_fail("你身上没有宝物。\n");
	destruct(t);
	complete_stage(me);
	return 1;
}

// ---------- 死亡 ----------

int on_die(object me)
{
	mapping s = state(me);

	if (! s) return 0;
	s["life"] -= 1;
	s["deaths"] = (s["deaths"] || 0) + 1;
	if (s["life"] <= 0)
	{
		tell_object(me, HIR "三条命都用完了，本局远征结束。局内天赋消散。\n" NOR);
		me->revive(1);
		me->set("qi", me->query("max_qi"));
		me->set("eff_qi", me->query("max_qi"));
		me->move(BACK_ROOM);
		end_run(me);
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

// ---------- 状态与入口 ----------

string status(object me)
{
	mapping s = state(me), def;

	if (! s) return "尚未开始远征。";
	if (s["stage"] >= sizeof(stages))
		return sprintf("五关已经全部通过，可以结算。\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
			s["life"], s["max_life"] || MAX_LIFE, s["points"],
			sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
			me->query("yuanzheng/prestige"));
	def = stages[s["stage"]];
	return sprintf("%s\n  目标：%s\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
		def["title"], def["hint"], s["life"], s["max_life"] || MAX_LIFE, s["points"],
		sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
		me->query("yuanzheng/prestige"));
}

int has_weapon(object me)
{
	object ob;

	foreach (ob in all_inventory(me))
		if (ob->query("yz_weapon")) return 1;
	return 0;
}

void give_weapon(object me, string file)
{
	object ob;

	if (! stringp(file) || ! sizeof(file)) return;
	ob = new(file);
	if (! ob) return;
	ob->set("yz_weapon", 1);
	ob->set("no_drop", 1);
	if (! ob->move(me))
	{
		destruct(ob);
		return;
	}
	ob->wield();
}

void style_menu(object me)
{
	tell_object(me, ZJOBLONG "选一个流派开局\n" +
		"剑客：长剑 + 剑法，招架稳，出手快\n" +
		"拳师：空手 + 拳脚，身法最灵，贴身短打\n" +
		"刀客：单刀 + 刀法，血厚甲硬，一刀是一刀\n" +
		ZJOBACTS2 + ZJMENUF(3, 3, 8, 30) +
		"剑客:yuanzheng start sword" ZJSEP +
		"拳师:yuanzheng start fist" ZJSEP +
		"刀客:yuanzheng start blade" ZJSEP + "\n");
}

// 有一局没收尾时（打完没结算、或者卡在某一关），把能做的事摆出来
int busy_menu(object me, mapping s)
{
	string str;

	if (s["stage"] >= sizeof(stages))
		str = ZJOBLONG "这一局五关已经打完了，先结算，才能再开一局。\n" ZJOBACTS2 + ZJMENUF(2, 3, 8, 30);
	else
		str = ZJOBLONG "你还有一局远征没打完（" + stages[s["stage"]]["title"] + "）。\n" ZJOBACTS2 + ZJMENUF(2, 3, 8, 30);
	str += "继续这一局:yuanzheng resume" ZJSEP;
	str += "结算这一局:yuanzheng settle" ZJSEP;
	str += "放弃这一局:yuanzheng abandon" ZJSEP;
	tell_object(me, str + "\n");
	return 1;
}

int start(object me, string style)
{
	mapping s, st;

	// 上一局还没收尾就想开新的：给按钮，别只丢一句报错
	s = state(me);
	if (s) return busy_menu(me, s);
	if (! stringp(style) || ! sizeof(style))
	{
		style_menu(me);
		return 1;
	}
	st = styles[style];
	if (! mapp(st)) return notify_fail("请选择流派：剑客（sword）、拳师（fist）、刀客（blade）。\n");

	s = ([ "stage":0, "life":MAX_LIFE + (has_perk(me, "life") ? 1 : 0),
	       "points":has_perk(me, "point") ? 1 : 0, "talents":({}),
	       "buff":([]), "raw":([]), "skills":([]), "style":style, "started":time(), "deaths":0 ]);
	// 流派底子：远征的对手本来就不弱，给的这点加成只是让人打得动
	s["buff"]["apply/attack"] = 20 + (has_perk(me, "atk") ? 10 : 0);
	s["buff"]["apply/damage"] = 30;
	me->add_temp("apply/attack", s["buff"]["apply/attack"]);
	me->add_temp("apply/damage", 30);
	if (style == "fist")
	{
		s["buff"]["apply/unarmed_damage"] = 50;
		me->add_temp("apply/unarmed_damage", 50);
	}
	if (style == "blade")
	{
		s["buff"]["apply/armor"] = 10;
		me->add_temp("apply/armor", 10);
	}
	// 关掉自动逃跑：远征的对手本来就不强，一跑出房间这一关就等于断了
	s["wimpy"] = me->query("env/wimpy");
	me->set("env/wimpy", 0);
	// 新角色没有武功，出手几乎打不中；按流派借一段基本功夫，结算时还原
	if (mapp(st["skills"]))
		foreach (string sk, int lv in st["skills"])
		{
			s["skills"][sk] = me->query_skill(sk);
			me->set_skill(sk, s["skills"][sk] + lv);
		}
	// 经验差太多会被系统判成完全打不中，局内临时补一段；raw 记的是增量，结算时减回去
	me->add("combat_exp", 30000);
	s["raw"]["combat_exp"] = (s["raw"]["combat_exp"] || 0) + 30000;
	s["max_life"] = s["life"];
	me->set_temp("yuanzheng", s);
	save_run(me);
	me->set_override("die", (: call_other, __FILE__, "on_die" :));
	if (stringp(st["weapon"])) give_weapon(me, st["weapon"]);
	tell_object(me, "你以" + st["name"] + "的身份踏上了江湖远征：五关，" + s["life"] + " 条命。\n" +
		st["desc"] + "\n" +
		"一、剿匪　二、夺宝　三、寻访　四、截杀　五、终局\n");
	begin_stage(me);
	return 1;
}

int choose(object me, int n)
{
	mapping s = state(me), t;
	mapping *pool;
	int base;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["points"] < 1) return notify_fail("你没有可用的属性点。\n");
	if (n < 1 || n > 3) return notify_fail("请选择 1、2 或 3。\n");
	pool = talents[s["style"]];
	if (! arrayp(pool)) pool = talents["fist"];
	base = ((s["stage"] < 1 ? 0 : s["stage"] - 1) * 3) % sizeof(pool);
	t = pool[(base + n - 1) % sizeof(pool)];
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

	if (! s) return notify_fail("你还没有开始远征。\n");
	tell_object(me, "你放弃了这次远征，局内天赋已经消散。想重开的话，再选一个流派（yuanzheng）。\n");
	end_run(me);
	return 1;
}

// 五关全过带一件东西回去，是这一局唯一能带出局的东西
void give_spoil(object me, string style)
{
	string file;
	object ob;

	switch (style)
	{
	case "sword":	file = "/clone/misc/yz_spoil_sword"; break;
	case "blade":	file = "/clone/misc/yz_spoil_blade"; break;
	default:	file = "/clone/misc/yz_spoil_armor"; break;
	}
	ob = new(file);
	if (! ob) return;
	if (! ob->move(me))
	{
		ob->move(environment(me));
		tell_object(me, "你身上放不下战利品，它掉在地上了。\n");
		return;
	}
	tell_object(me, "你从这一局里带出了一件" + ob->query("name") + "。\n");
}

// 中途下线再上来：临时状态已经没了，按存档把这一局接回来
int resume(object me)
{
	mapping s = state(me);

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["stage"] >= sizeof(stages))
	{
		tell_object(me, "五关已经全部通过，可以结算（yuanzheng settle）。\n");
		return 1;
	}
	tell_object(me, "接着打这一局。\n");
	begin_stage(me);
	return 1;
}

string fmt_time(int sec)
{
	if (sec < 60) return sec + " 秒";
	return sprintf("%d 分 %02d 秒", sec / 60, sec % 60);
}

string tally(string *names)
{
	mapping c = ([]);
	string *out = ({});

	if (! sizeof(names)) return "无";
	foreach (string n in names) c[n] = (c[n] || 0) + 1;
	foreach (string n in sort_array(keys(c), 1))
		out += ({ c[n] > 1 ? n + "×" + c[n] : n });
	return implode(out, "、");
}

int settle(object me)
{
	mapping s = state(me);
	int gain;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["stage"] < sizeof(stages)) return notify_fail("还有关卡没有通过，不能结算。\n");
	gain = 8 + sizeof(s["talents"]) * 2 + (s["life"] - 1) * 3;
	if (has_perk(me, "gain")) gain += gain * 20 / 100;
	give_spoil(me, s["style"]);
	me->add("yuanzheng/prestige", gain);
	tell_object(me, "远征结算完成！五关全过，剩余 " + s["life"] + " 条命，获得远征声望 " +
		gain + " 点。局内天赋已经消散，不会带回普通江湖。\n" +
		"本局用时 " + fmt_time(time() - s["started"]) + "，倒下 " +
		(s["deaths"] || 0) + " 次，天赋：" + tally(s["talents"]) + "\n" +
		"想再来一局的话，再开一次远征（yuanzheng）。\n");
	end_run(me);
	return 1;
}

// 刷新后世界里的目标可能已经不在了，进菜单时补上
void ensure_world(object me)
{
	mapping s = state(me), def;

	if (! s || s["stage"] >= sizeof(stages)) return;
	def = stages[s["stage"]];
	if (def["type"] == "ask")
	{
		if (! find_my_info(me)) spawn(me, s["stage"]);
		return;
	}
	if (def["type"] == "item")
	{
		if (find_my_enemy(me, s["stage"])) return;
		if (present("treasure", me)) return;
	}
	if (! find_my_enemy(me, s["stage"])) spawn(me, s["stage"]);
}

// 给测试和巫师用：直接判定当前关通过
int debug_win(object me)
{
	mapping s = state(me);

	if (! s) return notify_fail("没有远征。\n");
	if (wiz_level(me) < 5) return notify_fail("只有巫师能这么做。\n");
	complete_stage(me);
	return 1;
}
