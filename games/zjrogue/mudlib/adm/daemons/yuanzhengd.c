// 江湖远征 P2：五段有实际目标的关卡（剿匪、夺宝、寻访、截杀、终局），三条命，三选一天赋。
// 局内天赋只在本局有效：apply/* 走临时加成，max_* 与四维写 dbase 并在结算时减回去。
#include <ansi.h>

#define MAX_LIFE 3
#define BACK_ROOM "/d/city/kedian"
#define YZ_ENEMY "/kungfu/class/yuanzheng/enemy"
#define YZ_INFO "/kungfu/class/yuanzheng/informant"
#define YZ_TREASURE "/clone/misc/yz_treasure"
#define YZ_SPOIL_SWORD "/clone/misc/yz_spoil_sword"
#define YZ_SPOIL_BLADE "/clone/misc/yz_spoil_blade"
#define YZ_SPOIL_ARMOR "/clone/misc/yz_spoil_armor"

// 前三桩各有各的好处，挑哪桩先做就真的一回事：
//   剿匪 up=attack（下一关之前攻击 +10）  夺宝 coin=10（这关多捡 10 枚）  寻访 point=1（这关多 1 点天赋）
mapping *stages = ({
	([ "type":"kill", "title":"一、剿匪", "key":"kill", "who":"恶汉", "eid":"ehan",
	   "up":"attack", "gain":"打完手上更利索，下一关之前攻击 +10",
	   "hint":"杀掉在那里闹事的恶汉（kill ehan）" ]),
	([ "type":"item", "title":"二、夺宝", "key":"item", "who":"守卫", "eid":"shouwei",
	   "coin":10, "gain":"守卫身上有货，这关多捡 10 枚铜钱",
	   "hint":"杀掉守卫，拿到他身上的宝物，再回客店上交（yuanzheng submit）" ]),
	([ "type":"ask", "title":"三、寻访", "key":"ask", "who":"线人", "eid":"xianren",
	   "point":1, "gain":"线人指条路，这关多 1 点天赋",
	   "hint":"找到线人，向他打听远征（ask xianren about 远征）" ]),
	([ "type":"kill", "title":"四、截杀", "key":"street", "who":"副手", "eid":"fushou",
	   "up":"damage", "gain":"副手身上带着药，这关之后出手更重 +8",
	   "hint":"截杀匪首的副手（kill fushou）" ]),
	([ "type":"boss", "title":"五、终局", "key":"boss", "who":"匪首", "eid":"feishou",
	   "hint":"迎战匪首，赢下这一局（kill feishou）", "boss":1 ])
});

// 每局随机挑一座城：目标、线人、匪首都在那座城里，不再每局都跑同一套扬州地点
mapping cities = ([
	"city": ([ "name":"扬州", "kill":"/d/city/guangchang", "item":"/d/city/nandajie1",
	           "street":"/d/city/beimen", "ask":"/d/city/wumiao",
	           "boss":"/d/city/guangchang", "inn":"/d/city/kedian" ]),
	"suzhou": ([ "name":"苏州", "kill":"/d/suzhou/dongdajie2", "item":"/d/suzhou/dongdajie1",
	             "street":"/d/suzhou/beidajie1", "ask":"/d/suzhou/hanshansi",
	             "boss":"/d/suzhou/huqiu", "inn":"/d/suzhou/kedian" ]),
	"hangzhou": ([ "name":"杭州", "kill":"/d/hangzhou/dadao1", "item":"/d/hangzhou/dalu1",
	               "street":"/d/hangzhou/huagang", "ask":"/d/hangzhou/jingcisi",
	               "boss":"/d/hangzhou/duanqiao", "inn":"/d/hangzhou/kedian" ]),
	"quanzhou": ([ "name":"泉州", "kill":"/d/quanzhou/zhongxin", "item":"/d/quanzhou/xijie",
	               "street":"/d/quanzhou/nanmen", "ask":"/d/quanzhou/chating",
	               "boss":"/d/quanzhou/zhongxin", "inn":"/d/quanzhou/chating" ])
]);

// ---- 开局构筑：三种流派，各有一套初始功夫与 15 个专属天赋 ----
mapping styles = ([
	"sword": ([ "name" : "剑客",
		    "desc" : "长剑在手，招架最稳，出手快，靠剑法连招取势",
		    "weapon" : "/clone/weapon/changjian", "weapon_type" : "sword",
		    "main" : "sword",
		    "skills" : ([ "sword" : 70, "parry" : 50, "dodge" : 40, "force" : 30 ]) ]),
	"fist" : ([ "name" : "拳师",
		    "desc" : "空手对敌，身法最灵，贴身短打又快又狠",
		    "main" : "unarmed",
		    "skills" : ([ "unarmed" : 80, "cuff" : 70, "dodge" : 60, "parry" : 40, "force" : 30 ]) ]),
	"blade": ([ "name" : "刀客",
		    "desc" : "单刀走刚猛一路，血厚甲硬，一刀是一刀",
		    "weapon" : "/clone/weapon/dadao", "weapon_type" : "blade",
		    "main" : "blade",
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
// 局外特权分三条线，每条都得先买过上一级
mapping *perks = ({
	([ "id":"point", "name":"老练", "desc":"每局开局多 1 点属性点", "cost":30, "tier":1 ]),
	([ "id":"life",	 "name":"命硬", "desc":"每局多 1 条命", "cost":60, "tier":1 ]),
	([ "id":"atk",	 "name":"磨砺", "desc":"每局开局再加 10 点攻击", "cost":40, "tier":1 ]),
	([ "id":"gain",	 "name":"名望", "desc":"结算得到的声望 +20%", "cost":80, "tier":1 ]),
	([ "id":"talent", "name":"师承", "desc":"开局多 1 点天赋点", "cost":90, "tier":2, "need":"point" ]),
	([ "id":"coin",	 "name":"眼力", "desc":"每关多捡 4 枚铜钱", "cost":70, "tier":2, "need":"atk" ]),
	([ "id":"spoil", "name":"旧藏", "desc":"开局带一件上次的战利品", "cost":110, "tier":2, "need":"life" ]),
	([ "id":"scout", "name":"耳目", "desc":"开局就知道这一局五关要打谁", "cost":50, "tier":2, "need":"gain" ]),
	([ "id":"spoil2", "name":"行囊", "desc":"开局带两件战利品（先买旧藏）", "cost":160, "tier":3, "need":"spoil" ]),
	([ "id":"life2", "name":"铁骨", "desc":"每局再多 1 条命（先买命硬）", "cost":140, "tier":3, "need":"life" ])
});

int has_perk(object me, string id)
{
	return me->query("yuanzheng/perk/" + id) ? 1 : 0;
}

int perks_of(object me, string id)
{
	int n = has_perk(me, id) ? 1 : 0;

	if (id == "life") n += has_perk(me, "life2") ? 1 : 0;
	if (id == "spoil") n += has_perk(me, "spoil2") ? 1 : 0;
	return n;
}

string perk_name(string id)
{
	foreach (mapping p in perks)
		if (p["id"] == id) return p["name"];
	return id;
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
		if (! owned && stringp(perks[i]["need"]) && ! has_perk(me, perks[i]["need"]))
		{
			str += perks[i]["name"] + "（先买「" + perk_name(perks[i]["need"]) + "」）:yuanzheng shop" ZJSEP;
			continue;
		}
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

	if (! intp(n) || n < 1 || n > sizeof(perks)) return notify_fail("没有这件特权。\n");
	p = perks[n - 1];
	if (has_perk(me, p["id"])) return notify_fail("你已经拥有了「" + p["name"] + "」。\n");
	if (stringp(p["need"]) && ! has_perk(me, p["need"]))
		return notify_fail("得先有「" + perk_name(p["need"]) + "」才能买这个。\n");
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
	me->add("yuanzheng/earned", n);
	tell_object(me, "（调试）声望 +" + n + "，现在是 " + me->query("yuanzheng/prestige") + "。\n");
	return 1;
}

void create()
{
	seteuid(getuid());
	set_heart_beat(2);
}

// 开局挑路线后，五关的先后可以变：order 里存的是 stages 的下标，stage 只是走到第几关
int real_stage(mapping s, int pos)
{
	int i;

	if (! mapp(s)) return pos;
	if (! arrayp(s["order"]) || pos < 0 || pos >= sizeof(s["order"])) return pos;
	i = s["order"][pos];
	return (i >= 0 && i < sizeof(stages)) ? i : pos;
}

mapping def_at(mapping s, int pos)
{
	int i = real_stage(s, pos);

	return (i >= 0 && i < sizeof(stages)) ? stages[i] : 0;
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
		if (! mapp(def = def_at(s, s["stage"]))) continue;
		if (! objectp(env = environment(me))) continue;
		if (base_name(env) != stage_room(me, def)) continue;
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
	// 开局替下来的真兵器，这时装回去；真兵器在局中丢了的就当没了
	foreach (object wdb in (arrayp(s["set_aside"]) ? s["set_aside"] : ({})))
	{
		if (! objectp(wdb)) continue;
		if (objectp(environment(wdb)) && environment(wdb) != me) continue;
		if (environment(wdb) != me) wdb->move(me, 1);
		if (objectp(environment(wdb)) && ! wdb->query("equipped")) wdb->wield();
		tell_object(me, "（" + wdb->name() + "又回到手上）\n");
	}
	// 局里一直在打，踏空的临时计数会留下，踏出江湖就清掉
	me->delete_temp("last_applied");
	me->delete_temp("last_skill");
	// 局内加成是改在真身身上的，这一趟里正常练功/打怪都算在远征账上，得说清楚
	tell_object(me, HIY "（远征收尾：局内的天赋加成、借来的兵器都收回了；这一趟里练的功、打的东西都留在身上，按正常游戏算。）" NOR "\n");
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

string style_of(object me)
{
	mapping s = state(me);

	return s ? s["style"] : "";
}

mapping city_of(object me)
{
	mapping s = state(me), c;

	if (! s) return cities["city"];
	c = cities[s["city"]];
	return mapp(c) ? c : cities["city"];
}

string stage_room(object me, mapping def)
{
	mapping c = city_of(me);

	return (c && stringp(def["key"])) ? c[def["key"]] : "/d/city/guangchang";
}

string room_name(string file)
{
	object ob;

	if (! stringp(file) || ! objectp(ob = load_object(file))) return "那地方";
	return ob->query("short") || file;
}

mapping cur_stage(object me)
{
	mapping s = state(me);

	if (! s) return 0;
	if (s["stage"] < 0 || s["stage"] >= sizeof(stages)) return 0;
	return def_at(s, s["stage"]);
}

void spawn(object me, int stage)
{
	mapping s = state(me), def = def_at(s, stage);
	object room, ob;

	if (! mapp(def)) return;
	if (! objectp(room = load_object(stage_room(me, def)))) return;

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
	ob->setup_from(me, stage, def["type"] == "boss" ? "boss" :
		(def["type"] == "item" ? "guard" : (def["key"] == "street" ? "vice" : "thug")),
		def["who"], def["eid"]);
	ob->set("yz_style", style_of(me));
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
	write("stage=" + s["stage"] + " room=" + stage_room(me, def) +
	      " here=" + (env ? base_name(env) : "none") + "\n");
	return 1;
}

// 开局先看一张悬赏榜：三桩活儿摆在面前，自己挑先做哪桩
string brief_text(object me)
{
	mapping s = state(me), c = city_of(me);
	string str;
	int i, k;

	if (! s) return "";
	str = "城门口贴着一张悬赏榜，墨迹还是新的：\n";
	for (i = 0; i < 3; i++)
	{
		k = real_stage(s, i);
		str += sprintf("  %s　%s·%s　%s\n", stages[k]["title"], c["name"],
			room_name(stage_room(me, stages[k])), stages[k]["gain"] || "");
	}
	if (has_perk(me, "scout"))
		for (i = 3; i < sizeof(stages); i++)
		{
			k = real_stage(s, i);
			str += sprintf("  %s　%s·%s（耳目打听来的）\n", stages[k]["title"], c["name"],
				room_name(stage_room(me, stages[k])));
		}
	else
		str += "  四、截杀　五、终局　（榜上没写是谁，走到跟前才知道）\n";
	return str;
}

void brief_menu(object me)
{
	mapping s = state(me);
	string str;

	if (! s) return;
	str = ZJOBLONG "远征简报\n" + brief_text(me) + "先去哪一桩？\n" ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	str += stages[real_stage(s, 0)]["title"] + ":yuanzheng plan 1" ZJSEP;
	str += stages[real_stage(s, 1)]["title"] + ":yuanzheng plan 2" ZJSEP;
	str += stages[real_stage(s, 2)]["title"] + ":yuanzheng plan 3" ZJSEP;
	tell_object(me, str + "\n");
}

// 选中一桩活儿排到最前面，剩下的按原序，截杀与终局仍压在最后
int plan(object me, int n)
{
	mapping s = state(me);
	int *open, pick, *rest;
	int i;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! s["planning"]) return notify_fail("这一局的路线已经定下了。\n");
	if (n < 1 || n > 3) return notify_fail("请选择 1、2 或 3。\n");
	open = ({ real_stage(s, 0), real_stage(s, 1), real_stage(s, 2) });
	pick = open[n - 1];
	rest = ({});
	for (i = 0; i < sizeof(open); i++)
		if (open[i] != pick) rest += ({ open[i] });
	s["order"] = ({ pick }) + rest + ({ 3, 4 });
	map_delete(s, "planning");
	me->set_temp("yuanzheng", s);
	save_run(me);
	tell_object(me, "你决定先去" + stages[pick]["title"] + "。\n");
	begin_stage(me);
	return 1;
}

void begin_stage(object me)
{
	mapping s = state(me), def;
	object env;

	if (! s) return;
	if (s["stage"] >= sizeof(stages)) return;
	if (! mapp(def = def_at(s, s["stage"]))) return;
	// 开局就把目标放到地点上，玩家走过去就能打，不用等心跳
	if (def["type"] == "ask" ? ! find_my_info(me) : ! find_my_enemy(me, s["stage"]))
		spawn(me, s["stage"]);
	tell_object(me, HIR "【远征】" NOR + def["title"] + "：" + def["hint"] + "\n");
	tell_object(me, "  地点：" + city_of(me)["name"] + "·" + room_name(stage_room(me, def)) +
		"（goto " + stage_room(me, def) + "）\n");
	// 重登回来的人，第一件事就是把「身上还带着局里的东西」摆出来给他看
	foreach (object it in all_inventory(me))
		if (it->query("yz_weapon") || it->query("yz_start_spoil"))
			it->set("no_drop", 1);
	if (objectp(env = environment(me)) && base_name(env) == stage_room(me, def))
		tell_object(me, HIC "目标就在此地。\n" NOR);
	else
		tell_object(me, "（走不过去就 yuanzheng pause 收起来，回头 yuanzheng resume 接着打。）\n");
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

// ---------- 局中遭遇 ----------
// 每过一关（除了最后一关）先撞上一件事，两个选择，都有代价。

mapping *event_pool()
{
	return ({
		([ "title":"黑店", "desc":"路边一间黑店，店家笑得殷勤，灶上的水刚烧开。",
		   "opts":({ "吃碗热面（回满气血，花 2 点声望）", "掀了他的灶（得 1 点属性点，掉三成气血）" }) ]),
		([ "title":"受伤的镖师", "desc":"一个镖师靠着树坐着，腿上中了一刀，镖旗倒在一边。",
		   "opts":({ "帮他包扎（此后出手更狠，攻击 +10）", "摸走他的镖（得 15 点声望）" }) ]),
		([ "title":"赌坊摊子", "desc":"树下摆着一个赌摊，摊主摇着骰子招呼你。",
		   "opts":({ "押一把（一半机会得 10 点声望，一半掉两成气血）", "走开（回一点气血）" }) ]),
	});
}

void event_menu(object me)
{
	mapping s = state(me), ev;
	mapping *pool;
	string str;
	int id, i;

	if (! s) return;
	if (! mapp(s["event"])) return;
	id = s["event"]["id"];
	pool = event_pool();
	if (id < 0 || id >= sizeof(pool)) { map_delete(s, "event"); return; }
	ev = pool[id];
	str = ZJOBLONG "路上遇到：" + ev["title"] + "\n" + ev["desc"] + "\n" ZJOBACTS2 + ZJMENUF(2, 3, 8, 30);
	for (i = 0; i < sizeof(ev["opts"]); i++)
		str += ev["opts"][i] + ":yuanzheng event " + (i + 1) + ZJSEP;
	tell_object(me, str + "\n");
}

int resolve_event(object me, int n)
{
	mapping s = state(me);
	mapping *pool;
	int id;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! mapp(s["event"])) return notify_fail("现在没有遇到什么事。\n");
	if (n < 1 || n > 2) return notify_fail("请选择 1 或 2。\n");
	id = s["event"]["id"];
	map_delete(s, "event");

	switch (id)
	{
	case 0:	// 黑店
		if (n == 1)
		{
			me->set("qi", me->query("max_qi"));
			me->set("eff_qi", me->query("max_qi"));
			me->add("yuanzheng/prestige", -2);
			tell_object(me, "你埋头吃完，身上暖了起来，顺手付了 2 点声望。\n");
		}
		else
		{
			s["points"] += 1;
			me->set("qi", me->query("qi") * 7 / 10 + 1);
			tell_object(me, "你一脚踹翻灶台，趁乱翻了翻柜台，得了 1 点属性点，也被烫掉了三成气血。\n");
		}
		break;
	case 1:	// 受伤的镖师
		if (n == 1)
		{
			s["buff"]["apply/attack"] = (s["buff"]["apply/attack"] || 0) + 10;
			me->add_temp("apply/attack", 10);
			tell_object(me, "你替他扎紧伤口，他教了你两记发力的诀窍：攻击 +10。\n");
		}
		else
		{
			me->add("yuanzheng/prestige", 15);
			tell_object(me, "你摸走他的镖，卖了 15 点声望。他盯着你，什么也没说。\n");
		}
		break;
	default:	// 赌坊
		if (n == 1)
		{
			if (random(2))
			{
				me->add("yuanzheng/prestige", 10);
				tell_object(me, "骰子开了，你赢了 10 点声望。\n");
			}
			else
			{
				me->set("qi", me->query("qi") * 8 / 10 + 1);
				tell_object(me, "骰子开了，你输了，被人按住搜了一遍，掉了两成气血。\n");
			}
		}
		else
		{
			me->set("qi", me->query("qi") + me->query("max_qi") / 10);
			if (me->query("qi") > me->query("max_qi")) me->set("qi", me->query("max_qi"));
			tell_object(me, "你摆摆手走开，在路边坐下歇了歇，回了一点气血。\n");
		}
		break;
	}
	me->set_temp("yuanzheng", s);
	save_run(me);
	talent_menu(me);
	begin_stage(me);
	return 1;
}

void complete_stage(object me)
{
	mapping s = state(me), def;
	int earned;

	if (! s || ! mapp(def = def_at(s, s["stage"]))) return;

	clean_world(me, s["stage"]);
	s["stage"] += 1;
	s["points"] += 1 + (int)def["point"];
	me->set_temp("yuanzheng", s);
	save_run(me);

	earned = 6 + (s["stage"] - 1) * 4 + (has_perk(me, "coin") ? 4 : 0) + (int)def["coin"];
	s["coin"] = (s["coin"] || 0) + earned;
	roll_stall(me, s);
	tell_object(me, HIG "【远征】" + def["title"] + " 完成！得到 " + (1 + (int)def["point"]) +
		" 点属性点，捡到 " + earned + " 枚铜钱。\n" NOR);
	// 剿匪/截杀给的是一小段时间的攻击、伤害加成，换关就淡掉
	if (stringp(def["up"]))
	{
		int add = def["up"] == "attack" ? 10 : 8;
		s["buff"]["apply/" + def["up"]] = (s["buff"]["apply/" + def["up"]] || 0) + add;
		me->add_temp("apply/" + def["up"], add);
		tell_object(me, HIC "（" + def["gain"] + "）\n" NOR);
	}
	else if (stringp(def["gain"]))
		tell_object(me, HIC "（" + def["gain"] + "）\n" NOR);
	if (s["stage"] >= sizeof(stages))
	{
		tell_object(me, HIY "五关全部通过！输入 yuanzheng settle 结算这一局。\n" NOR);
		return;
	}
	s["event"] = ([ "id":random(sizeof(event_pool())) ]);
	me->set_temp("yuanzheng", s);
	save_run(me);
	event_menu(me);
}

// 副手跑了：这一关白打，目标撤掉，打法重新来一遍
void enemy_fled(object me, object enemy, string room)
{
	mapping s, def;

	if (! objectp(me) || ! (s = state(me))) return;
	if (! mapp(def = cur_stage(me))) return;
	if ((int)enemy->query("yz_stage") != s["stage"]) return;
	if (enemy->query("yz_owner") != me->query("id")) return;
	tell_object(me, HIR "【远征】" + def["title"] + "：人跑了，这一关得重来。" NOR "\n");
	tell_object(me, "  回去再堵他一回（goto " + stage_room(me, def) + "），路上先喘口气。\n");
	clean_world(me, s["stage"]);
	call_out("respawn", 6, me, s["stage"]);
}

void respawn(object me, int stage)
{
	mapping s, def;

	if (! objectp(me) || ! (s = state(me))) return;
	if (s["stage"] != stage) return;
	if (! mapp(def = def_at(s, stage))) return;
	if (def["type"] == "ask") return;
	if (find_my_enemy(me, stage)) return;
	spawn(me, stage);
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
		// 身上已经有一件（上一件没交、或者重登过了）就别再摸一件，免得交完还剩一件
		if (! present("treasure", me))
		{
			object t = new(YZ_TREASURE);
			t->set("yz_stage", s["stage"]);
			t->move(me, 1);
		}
		tell_object(me, HIY "你从守卫身上摸出一件宝物。带回" +
			room_name(city_of(me)["inn"]) + "上交（yuanzheng submit）。\n" NOR);
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
	if (! env || base_name(env) != city_of(me)["inn"])
		return notify_fail("要把宝物带回" + room_name(city_of(me)["inn"]) + "上交。\n");
	if (! objectp(t = present("treasure", me)))
		return notify_fail("你身上没有宝物。\n");
	destruct(t);
	complete_stage(me);
	return 1;
}

// ---------- 死亡 ----------

// 只有巫师用：把这一局的命改到 1，用来试「正常游玩死掉」这条分支
int debug_life(object me, int n)
{
	mapping s = state(me);

	if (! wiz_level(me)) return 0;
	if (! s) return notify_fail("你还没有开始远征。\n");
	// 参数是用命令传进来的，没给就是 0（谁传了 "x" 这种字符串，这里会直接报错）
	if (! intp(n) || n < 1) n = 1;
	s["life"] = n;
	me->set_temp("yuanzheng", s);
	save_run(me);
	tell_object(me, "（这一局还剩 " + n + " 条命）\n");
	return 1;
}

// 离开江湖：把局里的目标和借来/带出来的东西先挪开，让人放心去做别的事
// 这一局的进度不丢，回来 yuanzheng resume 就在原地接着打
int pause(object me)
{
	mapping s = state(me), *kill = ({});
	object ob;
	int n = 0;

	if (! s) return notify_fail("你还没有开始远征。\n");
	foreach (ob in children(YZ_ENEMY))
		if (ob && ob->query("yz_owner") == me->query("id")) kill += ({ ob });
	foreach (ob in children(YZ_INFO))
		if (ob && ob->query("yz_owner") == me->query("id")) kill += ({ ob });
	if (sizeof(kill)) call_out("purge", 1, kill);
	foreach (ob in all_inventory(me))
	{
		if (! ob->query("yz_weapon") && ! ob->query("yz_start_spoil")) continue;
		n++;
		destruct(ob);
	}
	tell_object(me, "你把局里的事先撂下了：目标暂时收起" + (n ? "，局内的东西也先收走 " + n + " 件" : "") +
		"。这一局的进度还在，想接着打就打 yuanzheng resume。\n");
	return 1;
}

// 这一下算谁的：正在打局里的目标或跟人对打算远征，走在路上空着手死算正常游玩
int in_battle(object me)
{
	object ob, env = environment(me);

	if (! objectp(env)) return 0;
	foreach (ob in all_inventory(env))
	{
		if (! ob->is_character() || ob == me) continue;
		if (ob->query("yz_owner") == me->query("id")) return 1;
		if (! userp(ob) && ob->is_fighting(me)) return 1;
	}
	return 0;
}

int on_die(object me)
{
	mapping s = state(me);
	int own;

	if (! s) return 0;
	// 正在正常游玩（身边没有在打的人和局里的目标）时死了，不该拿远征的命来抵
	own = in_battle(me);
	// 只剩最后一条命时不再豁免：一条命都拿来兜底就等于没有终点
	if (s["life"] > 1 && ! own)
	{
		tell_object(me, HIY "（这一下不是远征里的打斗，远征的 " + s["life"] +
			" 条命还在。接着打就打 yuanzheng resume。）" NOR "\n");
		// 让原版的死亡流程照常走：该掉的东西、该回的地点都由它自己处理
		return 0;
	}
	if (s["charm"] > 0)
	{
		s["charm"] -= 1;
		me->revive(1);
		me->set("qi", me->query("max_qi"));
		me->set("eff_qi", me->query("max_qi"));
		me->set_temp("yuanzheng", s);
		save_run(me);
		me->set_override("die", (: call_other, __FILE__, "on_die" :));
		tell_object(me, HIY "免死符烧成一道黄光，替你挡下了这一下。\n" NOR);
		return 1;
	}
	s["life"] -= 1;
	s["deaths"] = (s["deaths"] || 0) + 1;
	if (s["life"] <= 0)
	{
		tell_object(me, HIR "三条命都用完了，本局远征结束。局内天赋消散。\n" NOR);
		me->revive(1);
		me->set("qi", me->query("max_qi"));
		me->set("eff_qi", me->query("max_qi"));
		me->move(city_of(me)["inn"] || BACK_ROOM);
		end_run(me);
		return 1;
	}
	me->revive(1);
	me->set("qi", me->query("max_qi"));
	me->set("eff_qi", me->query("max_qi"));
	me->set("jing", me->query("max_jing"));
	me->set("eff_jing", me->query("max_jing"));
	me->move(city_of(me)["inn"] || BACK_ROOM);
	me->set_temp("yuanzheng", s);
	save_run(me);
	me->set_override("die", (: call_other, __FILE__, "on_die" :));
	// 倒下算这一关没打成：局里的目标撤掉，下一关重新来过（免得旧目标留在原地打不了又挡路）
	clean_world(me);
	tell_object(me, HIR "你在远征中倒下了！还剩 " + s["life"] + " 条命，已被送回客店。这一关得重来。" NOR);
	if (s["life"] <= 1)
		tell_object(me, HIR "（再倒下一次，这一局就结束了。）" NOR);
	tell_object(me, "\n");
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
	if (s["planning"])
		return brief_text(me) + "（先挑一条路：yuanzheng plan 1|2|3）\n生命：" +
			s["life"] + "/" + (s["max_life"] || MAX_LIFE) + "　铜钱：" + (s["coin"] || 0) +
			"\n" + gear(me);
	if (mapp(s["event"]))
	{
		mapping *pool = event_pool();
		int id = s["event"]["id"];
		if (id >= 0 && id < sizeof(pool))
			return sprintf("路上遇到：%s\n%s\n（yuanzheng event 1 或 2 选一个）\n生命：%d/%d　属性点：%d　铜钱：%d",
				pool[id]["title"], pool[id]["desc"],
				s["life"], s["max_life"] || MAX_LIFE, s["points"], s["coin"] || 0);
	}
	if (! mapp(def = def_at(s, s["stage"]))) return "这一局的状态有点乱，先 yuanzheng resume 看看。";
	return sprintf("%s\n  目标：%s\n  地点：%s·%s\n生命：%d/%d　属性点：%d　铜钱：%d\n天赋：%s\n远征声望：%d",
		def["title"], def["hint"], city_of(me)["name"], room_name(stage_room(me, def)),
		s["life"], s["max_life"] || MAX_LIFE, s["points"], s["coin"] || 0,
		sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
		me->query("yuanzheng/prestige")) + "\n" + gear(me);
}

// 这一趟身上带着什么、还回去什么：让人自己看清哪些是局内的
string gear(object me)
{
	mapping s = state(me);
	string str = "身上：";
	int n = 0;

	if (! s) return "";
	foreach (object ob in all_inventory(me))
	{
		if (ob->query("yz_weapon"))
		{
			str += "借来的" + ob->name() + "　";
			n++;
		}
		else if (ob->query("yz_start_spoil"))
		{
			str += "自带战利品 " + ob->name() + "　";
			n++;
		}
		else if (member_array(ob, arrayp(s["set_aside"]) ? s["set_aside"] : ({})) >= 0)
		{
			str += "收着的" + ob->name() + "　";
			n++;
		}
	}
	if (! n) str += "（没有局内的东西）";
	if (arrayp(s["set_aside"]) && sizeof(s["set_aside"]))
		str += "\n收着的真兵器：结算或放弃时自己装回去。";
	else
		str += "\n";
	return str;
}

// 局内摊位：铜钱在关卡里赚，只能在本局花，结算后清零
mapping *stall_pool()
{
	return ({
		([ "id":"hp",    "name":"金创药",   "desc":"气血回满",       "cost":15 ]),
		([ "id":"armor", "name":"铁布衫符", "desc":"本局护甲 +10",   "cost":20 ]),
		([ "id":"dmg",   "name":"快刀符",   "desc":"本局伤害 +15",   "cost":20 ]),
		([ "id":"charm", "name":"免死符",   "desc":"下一次倒下不扣命", "cost":30 ]),
		([ "id":"point", "name":"偷天换日", "desc":"多 1 点天赋点",  "cost":35 ])
	});
}

void roll_stall(object me, mapping s)
{
	mapping *pool = stall_pool();
	int *idx = allocate(sizeof(pool));
	int i, j, t;

	for (i = 0; i < sizeof(idx); i++) idx[i] = i;
	for (i = sizeof(idx) - 1; i > 0; i--)
	{
		j = random(i + 1);
		t = idx[i]; idx[i] = idx[j]; idx[j] = t;
	}
	s["stall"] = ({});
	for (i = 0; i < 3 && i < sizeof(idx); i++)
		s["stall"] += ({ pool[idx[i]]["id"] });
}

mapping stall_item(string id)
{
	foreach (mapping it in stall_pool())
		if (it["id"] == id) return it;
	return 0;
}

int stall(object me)
{
	mapping s = state(me), it;
	string str;

	if (! s) return notify_fail("你还没有开始远征。\n");
	str = ZJOBLONG "路边的摊子\n铜钱：" + s["coin"] + "　（过一关会换一批货）\n"
		ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	if (! arrayp(s["stall"]) || ! sizeof(s["stall"]))
		str += "不买了:look" ZJSEP;
	else
	{
		int i = 0;
		foreach (string id in s["stall"])
		{
			i++;
			it = stall_item(id);
			if (mapp(it))
				str += it["name"] + "（" + it["cost"] + " 钱）:yuanzheng stall " + i + ZJSEP;
		}
	}
	write(str + "\n");
	return 1;
}

int buy_stall(object me, int n)
{
	mapping s = state(me), it;
	string id;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["planning"]) return notify_fail("先在悬赏榜上挑一条路（yuanzheng plan 1|2|3），再逛摊子。\n");
	if (! arrayp(s["stall"]) || ! intp(n) || n < 1 || n > sizeof(s["stall"]))
		return notify_fail("摊子上没有这一件。\n");
	id = s["stall"][n - 1];
	if (! mapp(it = stall_item(id))) return notify_fail("摊子上没有这一件。\n");
	if (s["coin"] < it["cost"])
		return notify_fail("铜钱不够（要 " + it["cost"] + " 钱）。\n");
	s["coin"] -= it["cost"];
	s["stall"] -= ({ id });
	if (id == "hp")
	{
		me->set("qi", me->query("max_qi"));
		me->set("eff_qi", me->query("max_qi"));
	}
	else if (id == "armor")
	{
		s["buff"]["apply/armor"] = (s["buff"]["apply/armor"] || 0) + 10;
		me->add_temp("apply/armor", 10);
	}
	else if (id == "dmg")
	{
		s["buff"]["apply/damage"] = (s["buff"]["apply/damage"] || 0) + 15;
		me->add_temp("apply/damage", 15);
	}
	else if (id == "charm")
		s["charm"] = (s["charm"] || 0) + 1;
	else if (id == "point")
		s["points"] += 1;
	me->set_temp("yuanzheng", s);
	save_run(me);
	tell_object(me, "你买下了" + it["name"] + "：" + it["desc"] + "。\n");
	return 1;
}

// 局外成长面板：累计声望、通关次数、最好成绩、已买特权
string overview(object me)
{
	string *got = ({});
	string str;
	int i;

	foreach (mapping p in perks)
		if (has_perk(me, p["id"])) got += ({ p["name"] });
	str = sprintf("远征声望：%d（累计 %d）", me->query("yuanzheng/prestige"),
		me->query("yuanzheng/earned"));
	str += "\n已通关：" + (me->query("yuanzheng/runs") || 0) + " 局";
	if (me->query("yuanzheng/best_time"))
		str += "　最快：" + fmt_time(me->query("yuanzheng/best_time"));
	if (me->query("yuanzheng/best_gain"))
		str += "　单局最高：" + me->query("yuanzheng/best_gain") + " 点";
	str += "\n已买特权：" + (sizeof(got) ? implode(got, "、") : "还没有（yuanzheng shop）");
	return str;
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
	ob->set("no_store", 1);
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
		str = ZJOBLONG "你还有一局远征没打完（" + def_at(s, s["stage"])["title"] + "）。\n" ZJOBACTS2 + ZJMENUF(2, 3, 8, 30);
	str += "继续这一局:yuanzheng resume" ZJSEP;
	str += "结算这一局:yuanzheng settle" ZJSEP;
	str += "放弃这一局:yuanzheng abandon" ZJSEP;
	tell_object(me, str + "\n");
	return 1;
}

int start(object me, string style, string city)
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

	s = ([ "stage":0, "life":MAX_LIFE + perks_of(me, "life"),
	       "points":(has_perk(me, "point") ? 1 : 0) + (has_perk(me, "talent") ? 1 : 0), "talents":({}),
	       "buff":([]), "raw":([]), "skills":([]), "style":style, "started":time(), "deaths":0,
	       "city":(mapp(cities[city]) ? city : keys(cities)[random(sizeof(cities))]),
	       "coin":0, "charm":0, "stall":({}),
	       "order":({0,1,2,3,4}), "planning":1 ]);
	roll_stall(me, s);
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
	// 借来的兵器要用本流派的功夫：先把手上那件真的收起来，免得打起来用的是别的兵器功夫
	me->delete_temp("last_skill");
	s["set_aside"] = ({});
	if (stringp(st["weapon_type"]))
		foreach (object wdb in all_inventory(me))
		{
			if (! wdb->query("equipped")) continue;
			if (! (stringp(wdb->query("skill_type")) && wdb->query("skill_type") == st["weapon_type"])) continue;
			wdb->unequip();
			s["set_aside"] += ({ wdb });
			tell_object(me, "（" + wdb->name() + "先收进行囊，这趟就用借来的兵器。）\n");
		}
	if (stringp(st["weapon"])) give_weapon(me, st["weapon"]);
	if (has_perk(me, "spoil")) give_start_spoil(me, perks_of(me, "spoil"));
	if (s["life"] <= 1)
		tell_object(me, HIY "（只剩最后一条命：这一趟里倒下就结束了，路上别硬碰硬。）" NOR "\n");
	tell_object(me, "你以" + st["name"] + "的身份踏上了江湖远征：五关，" + s["life"] + " 条命。\n" +
		st["desc"] + "\n" +
		"一、剿匪　二、夺宝　三、寻访　四、截杀　五、终局\n" +
		"这一趟去" + city_of(me)["name"] + "。\n");
	if (has_perk(me, "scout"))
	{
		string plan = "";
		int k;
		for (k = 0; k < sizeof(stages); k++)
			plan += (k ? "，" : "") + stages[k]["title"] + "：" + stages[k]["who"];
		tell_object(me, "（耳目打听到这一局五关要打的人：" + plan + "）\n");
	}
	brief_menu(me);
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
// 旧藏/行囊：开局按上次的流派带出上一件的战利品
void give_start_spoil(object me, int n)
{
	string style = me->query("yuanzheng/last_style");
	string file, nm;

	if (! stringp(style) || ! sizeof(style)) style = "sword";
	switch (style)
	{
	case "blade":	file = YZ_SPOIL_BLADE; break;
	case "fist":	file = YZ_SPOIL_ARMOR; break;
	default:	file = YZ_SPOIL_SWORD; break;
	}
	while (n-- > 0)
	{
		object ob = new(file);
		if (! objectp(ob)) continue;
		// 局内借来的兵器靠这个标记在结算时收回；战利品只记自己的标记，
		// 否则下一关清场时会被清掉、玩家也留不住它
		ob->set("yz_start_spoil", 1);
		ob->move(me, 1);
		if (ob->query("armor_prop/armor")) ob->wear();
		else ob->wield();
		nm = ob->query("name") || "战利品";
	}
	tell_object(me, "（行囊里带着上次的" + (nm || "战利品") + "，已经穿上）\n");
}

void give_spoil(object me, string style)
{
	string file;
	object ob;

	switch (style)
	{
	case "sword":	file = YZ_SPOIL_SWORD; break;
	case "blade":	file = YZ_SPOIL_BLADE; break;
	default:	file = YZ_SPOIL_ARMOR; break;
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
	if (mapp(s["event"]))
	{
		tell_object(me, "接着打这一局。\n");
		event_menu(me);
		return 1;
	}
	tell_object(me, "接着打这一局。\n");
	if (s["planning"])
	{
		brief_menu(me);
		return 1;
	}
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
	int gain, used;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["stage"] < sizeof(stages)) return notify_fail("还有关卡没有通过，不能结算。\n");
	gain = 8 + sizeof(s["talents"]) * 2 + (s["life"] - 1) * 3;
	if (has_perk(me, "gain")) gain += gain * 20 / 100;
	give_spoil(me, s["style"]);
	me->set("yuanzheng/last_style", s["style"]);
	me->add("yuanzheng/prestige", gain);
	me->add("yuanzheng/earned", gain);
	me->add("yuanzheng/runs", 1);
	if (gain > me->query("yuanzheng/best_gain")) me->set("yuanzheng/best_gain", gain);
	used = time() - s["started"];
	if (! me->query("yuanzheng/best_time") || used < me->query("yuanzheng/best_time"))
		me->set("yuanzheng/best_time", used);
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
	if (! mapp(def = def_at(s, s["stage"]))) return;
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
