// 江湖远征 P2：五段有实际目标的关卡（剿匪、夺宝、寻访、截杀、终局），三条命，三选一天赋。
// 局内天赋只在本局有效：apply/* 走临时加成，max_* 与四维写 dbase 并在结算时减回去。
#include <ansi.h>

#define MAX_LIFE 3
#define MAX_TIER 5
#define BACK_ROOM "/d/city/kedian"
#define YZ_ENEMY "/kungfu/class/yuanzheng/enemy"
#define YZ_INFO "/kungfu/class/yuanzheng/informant"
#define YZ_TREASURE "/clone/misc/yz_treasure"
#define YZ_ALLY "/kungfu/class/yuanzheng/helper"
#define YZ_SPOIL_SWORD "/clone/misc/yz_spoil_sword"
#define YZ_SPOIL_BLADE "/clone/misc/yz_spoil_blade"
#define YZ_SPOIL_BOOTS "/clone/misc/yz_spoil_boots"
#define YZ_SPOIL_MIRROR "/clone/misc/yz_spoil_mirror"
#define YZ_SPOIL_ARMOR "/clone/misc/yz_spoil_armor"

// 前三桩各有各的好处，挑哪桩先做就真的一回事：
//   剿匪 up=attack（下一关之前攻击 +10）  夺宝 coin=10（这关多捡 10 枚）  寻访 point=1（这关多 1 点天赋）
mapping *stages = ({
	([ "type":"kill", "title":"一、剿匪", "key":"kill", "who":"恶汉", "eid":"ehan",
	   "up":"attack", "gain":"打完手上更利索，下一关之前攻击 +10",
	   "hint":"杀掉在那里闹事的恶汉（kill ehan）" ]),
	([ "type":"item", "title":"二、夺宝", "key":"item", "who":"守卫", "eid":"shouwei",
	   "coin":10, "gain":"守卫身上有货，这关多捡 10 枚铜钱",
	   "hint":"杀掉守卫，拿到他身上的宝物，再带回本城落脚处上交（yuanzheng submit）" ]),
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
	"quanzhou": ([ "name":"泉州", "kill":"/d/quanzhou/zhongxin", "item":"/d/quanzhou/nanmen",
	               "street":"/d/quanzhou/beimen", "ask":"/d/quanzhou/majiu1",
	               // 茶亭其实在嘉兴地界（得 fly jx），倒下被送过去、上交还要跨城，改用城里的海港和马厩
	               "boss":"/d/quanzhou/zhongxin", "inn":"/d/quanzhou/haigang" ])
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
	([ "id":"gain",	 "name":"名望", "desc":"结算得到的声望 +20%", "cost":60, "tier":1 ]),
	([ "id":"talent", "name":"师承", "desc":"开局多 1 点天赋点", "cost":85, "tier":2, "need":"point" ]),
	([ "id":"coin",	 "name":"眼力", "desc":"每关多捡 4 枚铜钱", "cost":70, "tier":2, "need":"atk" ]),
	([ "id":"spoil", "name":"旧藏", "desc":"开局带一件上次的战利品", "cost":95, "tier":2, "need":"life" ]),
	([ "id":"scout", "name":"耳目", "desc":"开局就知道这一局五关要打谁", "cost":45, "tier":2, "need":"gain" ]),
	([ "id":"spoil2", "name":"行囊", "desc":"开局带两件战利品（先买旧藏）", "cost":140, "tier":3, "need":"spoil" ]),
	([ "id":"life2", "name":"铁骨", "desc":"每局再多 1 条命（先买命硬）", "cost":120, "tier":3, "need":"life" ])
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
	// 买不成也把商店留着，手机上不用再去找入口
	if (has_perk(me, p["id"]))
	{
		tell_object(me, "你已经拥有了「" + p["name"] + "」。\n");
		shop(me);
		return 1;
	}
	if (stringp(p["need"]) && ! has_perk(me, p["need"]))
	{
		tell_object(me, "得先有「" + perk_name(p["need"]) + "」才能买这个。\n");
		shop(me);
		return 1;
	}
	cost = p["cost"];
	if (me->query("yuanzheng/prestige") < cost)
	{
		tell_object(me, "声望不够：需要 " + cost + "，你只有 " + me->query("yuanzheng/prestige") + "。\n");
		shop(me);
		return 1;
	}
	me->add("yuanzheng/prestige", -cost);
	me->set("yuanzheng/perk/" + p["id"], 1);
	tell_object(me, "你花 " + cost + " 点声望换到了「" + p["name"] + "」：" + p["desc"] + "。\n");
	shop(me);
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

// 巫师调试：直接解锁到第 n 档，用来测高难度是否打得过
int debug_tier(object me, int n)
{
	if (wiz_level(me) < 5) return notify_fail("只有巫师能这么做。\n");
	if (n < 0 || n > MAX_TIER) return notify_fail("难度 0 到 " + MAX_TIER + "。\n");
	me->set("yuanzheng/max_tier", n);
	me->set("yuanzheng/tier", n);
	tell_object(me, "（调试）最高难度解锁到 " + n + "。\n");
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

int tier_of(object me);
string tier_name(int t);

void push_hint(object me)
{
	if (! objectp(me) || state(me)) return;
	// 打过的人结算后顶栏原来直接收起，再开一局又得去「系统」菜单里找；留一条入口
	if (! me->query("yuanzheng/runs"))
		tell_object(me, "YZ#江湖远征：点这里开一局（五关，三四分钟一局）\n");
	else
		tell_object(me, "YZ#江湖远征：再来一局（难度：" + tier_name(tier_of(me)) + "）\n");
}

void push_bar(object me)
{
	if (objectp(me) && state(me)) tell_object(me, "YZ#" + status_line(me) + "\n");
}

// 玩家一到关卡地点就把目标放出来，避免目标在空房间里被别人打掉
void heart_beat()
{
	object me, env;
	mapping s, def;

	foreach (me in users())
	{
		if (! objectp(me) || ! me->query("born")) continue;
		if (! mapp(s = me->query("yuanzheng/run")) && ! mapp(s = me->query_temp("yuanzheng")))
		{
			// 还没打过远征的新人：入口原来藏在「系统」菜单里，几乎找不到。挂一条顶栏提示，点了就是远征菜单
			if (! me->query_temp("yz_hint"))
			{
				me->set_temp("yz_hint", 1);
				call_out("push_hint", 4, me);
			}
			continue;
		}
		// 刷新页面重新登录后：马上补回局内加成和倒下的接管（原来要等玩家点一下远征才补），顶栏也重新挂上
		if (! me->query_temp("yz_bar"))
		{
			me->set_temp("yz_bar", 1);
			state(me);
			// 刚连上时网页还在「正在加载世界」，这时推的简讯会被丢掉，等几秒再推
			call_out("push_bar", 4, me);
		}
		if (s["stage"] >= sizeof(stages)) continue;
		if (! mapp(def = def_at(s, s["stage"]))) continue;
		if (! objectp(env = environment(me))) continue;
		if (base_name(env) != stage_room(me, def)) continue;
		if (def["type"] == "ask")
		{
			if (! find_my_info(me)) spawn(me, s["stage"]);
			continue;
		}
		// 夺宝关打倒守卫、摸到宝物之后，回客店的路上不能再刷一个守卫出来，
		// 否则玩家还站在原地时会被新守卫缠住，看着像「打不死又冒出来」
		if (def["type"] == "item" && present("treasure", me)) continue;
		if (! find_my_enemy(me, s["stage"])) spawn(me, s["stage"]);
	}
}

// 一行话：第几关、什么目标、还剩几条命、几个铜钱；没开局回空串
// 现在该往哪走：挑路/遭遇/五关已过时没有；夺宝关摸到宝物以后是本城客店
string goal_room(object me)
{
	mapping s = state(me), def;

	if (! s || s["planning"] || mapp(s["event"])) return 0;
	if (! mapp(def = cur_stage(me))) return 0;
	if (def["type"] == "item" && present("treasure", me)) return city_of(me)["inn"];
	return stage_room(me, def);
}

string status_line(object me)
{
	mapping s = state(me), def;

	if (! s) return "";
	if (! mapp(def = cur_stage(me)))
		return "远征：五关都过了，可以结算（yuanzheng）";
	return "远征" + (s["tier"] ? "·" + tier_name(s["tier"]) : "") + "：" + def["title"] + "　命 " + s["life"] + "/" + s["max_life"] +
		"　钱 " + (s["coin"] || 0);
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
	// 进度一变就写盘：网页端只在有输入后 2 秒存一次，打完一关不再按键就刷新，这一关会白打
	if (userp(me) && me->query("born")) me->save();
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
	// 空的简讯让界面把顶栏收掉，不然结算后还挂着「五、终局」
	tell_object(me, "YZ#\n");
	// 顶栏换成「再来一局」入口，不然打完一局又得去「系统」菜单里找
	call_out("push_hint", 2, me);
	// 帮手是这一局喊来的，收尾就散，别让它们在城里跟着玩家找人打
	foreach (object ob in children(YZ_ALLY))
		if (objectp(ob) && ob->query("yz_owner") == me->query("id")) destruct(ob);
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
// 不带 stage 时清掉这名玩家的全部局内目标。原来只写了 stage < 0 才算「全部」，
// 可省略参数时 LPC 传的是 0，结果倒下后只清第一关的目标：别的关卡的敌人留在原地，
// 回去还是那一只，血也一直在回，玩家一走回去就接着挨打。
varargs void clean_world(object me, int stage)
{
	object ob, *kill = ({});

	if (undefinedp(stage)) stage = -1;

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
		message_vision(HIC "一个缩着脖子的人凑了过来，好像在等谁。" NOR "\n", ob);
		tell_object(me, HIC "线人已经在了（ask xianren about 远征）" NOR "\n");
		return;
	}

	ob = new(YZ_ENEMY);
	ob->setup_from(me, stage, def["type"] == "boss" ? "boss" :
		(def["type"] == "item" ? "guard" : (def["key"] == "street" ? "vice" : "thug")),
		def["who"], def["eid"]);
	ob->set("yz_style", style_of(me));
	if (s["tier"] > 0)
	{
		int q = ob->query("max_qi") * (10 + s["tier"] * 3) / 10;
		ob->set("max_qi", q);
		ob->set("eff_qi", q);
		ob->set("qi", q);
		ob->add_temp("apply/damage", s["tier"] * 4);
		ob->add_temp("apply/unarmed_damage", s["tier"] * 4);
		// 出手值 = (技能³/10000 + 经验/1000) / 30 取整 × 臂力：原来敌人经验只有几百，
		// 取整后是 0，险五的匪首也几乎碰不到玩家。补到三万起，敌人才真正打得中人
		// （险一约五成，险五的后两关约七成）；敌人躲闪的技能是 0，走另一条分支，不变。
		ob->set("combat_exp", 25000 + s["tier"] * 5000);
	}
	ob->move(room);
	message_vision(HIR "$N" HIR "横着走了过来，堵在你面前。" NOR "\n", ob);
	tell_object(me, HIC "目标已出现：" + ob->query("name") + "（kill " + def["eid"] + "）" NOR "\n");

}

int where(object me)
{
	mapping s = state(me), def;
	object env, ob;

	if (! s) return notify_fail("你还没有开始远征。\n");
	// 还在挑路的时候 cur_stage 取的是排序后第一桩，别报「五关已经打完了」
	if (s["planning"])
	{
		write("stage=planning room=" + stage_room(me, def_at(s, s["stage"])) +
		      " here=" + (objectp(env = environment(me)) ? base_name(env) : "none") + "\n");
		return 1;
	}
	if (! mapp(def = cur_stage(me))) return notify_fail("五关已经打完了。\n");
	env = environment(me);
	write("stage=" + s["stage"] + " room=" + stage_room(me, def) +
	      " here=" + (env ? base_name(env) : "none") +
	      " me=" + me->query("qi") + "/" + me->query("max_qi") + "\n");
	// 排障用：这一关的对手还剩多少血、是不是已经判过死
	if (objectp(ob = find_my_enemy(me, s["stage"])))
		write("foe=" + ob->query("qi") + "/" + ob->query("max_qi") +
		      (ob->query_temp("yz_dead") ? " dead" : "") + "\n");
	else if (objectp(ob = find_my_info(me, s["stage"])))
		write("foe=info\n");
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
	// 简报时还没挑路，简讯先按榜上第一桩显示
	tell_object(me, "YZ#" + status_line(me) + "\n");
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
		"（自动带路：去 " + stage_room(me, def) + "）\n");
	// 重登回来的人，第一件事就是把「身上还带着局里的东西」摆出来给他看
	foreach (object it in all_inventory(me))
		if (it->query("yz_weapon") || it->query("yz_start_spoil"))
			it->set("no_drop", 1);
	if (objectp(env = environment(me)) && base_name(env) == stage_room(me, def))
		tell_object(me, HIC "目标就在此地。" NOR "\n");
	else
		tell_object(me, "（点菜单里的「带我去」或输入上面那句，会自动走过去；要先去干别的就 yuanzheng pause。）\n");
}

// 按已经选过几个天赋往后翻，一关给两点时第二张不会和第一张一模一样
int talent_base(mapping s, mapping *pool)
{
	return ((arrayp(s["talents"]) ? sizeof(s["talents"]) : 0) * 3) % sizeof(pool);
}

void talent_menu(object me)
{
	mapping s = state(me), t;
	mapping *pool;
	int i, base;
	string str;

	if (! s) return;
	pool = talents[s["style"]];
	if (! arrayp(pool)) pool = talents["fist"];
	base = talent_base(s, pool);
	str = ZJOBLONG "选一个天赋（属性点：" + s["points"] + "）\n" ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	for (i = 0; i < 3; i++)
	{
		t = pool[(base + i) % sizeof(pool)];
		str += t["name"] + " " + t["desc"] + ":yuanzheng choose " + (i + 1) + ZJSEP;
	}
	tell_object(me, str + "\n");
	tell_object(me, "YZ#" + status_line(me) + "\n");
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
	tell_object(me, "YZ#" + status_line(me) + "\n");
}

int show_event(object me)
{
	mapping s = state(me);

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! mapp(s["event"])) return notify_fail("现在没有遇到什么事。\n");
	event_menu(me);
	return 1;
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
		" 点属性点，捡到 " + earned + " 枚铜钱。" NOR "\n");
	// 剿匪/截杀给的是一小段时间的攻击、伤害加成，换关就淡掉
	if (stringp(def["up"]))
	{
		int add = def["up"] == "attack" ? 10 : 8;
		s["buff"]["apply/" + def["up"]] = (s["buff"]["apply/" + def["up"]] || 0) + add;
		me->add_temp("apply/" + def["up"], add);
		tell_object(me, HIC "（" + def["gain"] + "）" NOR "\n");
	}
	else if (stringp(def["gain"]))
		tell_object(me, HIC "（" + def["gain"] + "）" NOR "\n");
	if (s["stage"] >= sizeof(stages))
	{
		tell_object(me, HIY "五关全部通过！输入 yuanzheng settle 结算这一局。" NOR "\n");
		tell_object(me, "YZ#" + status_line(me) + "\n");
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
	tell_object(me, "  回去再堵他一回（自动带路：去 " + stage_room(me, def) + "），路上先喘口气。\n");
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
			city_of(me)["name"] + "·" + room_name(city_of(me)["inn"]) +
			"上交（yuanzheng submit）。" NOR "\n");
		tell_object(me, "  （自动带路：去 " + city_of(me)["inn"] + "）\n");
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
string inn_room(object me) { return city_of(me)["inn"]; }

int submit(object me)
{
	mapping s = state(me), def;
	object env, t;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (! mapp(def = cur_stage(me)) || def["type"] != "item")
		return notify_fail("现在不需要上交东西。\n");
	env = environment(me);
	if (! env || base_name(env) != city_of(me)["inn"])
		return notify_fail("要把宝物带回" + city_of(me)["name"] + "·" +
			room_name(city_of(me)["inn"]) + "上交。\n");
	if (! objectp(t = present("treasure", me)))
		return notify_fail("你身上没有宝物。\n");
	destruct(t);
	complete_stage(me);
	return 1;
}

// ---------- 死亡 ----------

// 只有巫师用：把这一局的命改到 1，用来试「正常游玩死掉」这条分支
// 巫师用：直接跳到第 n 关（1 起算），用来验后面的关卡
int jump(object me, int n)
{
	mapping s = state(me), def;

	if (wiz_level(me) < 4 && ! wizardp(me))
		return notify_fail("这是巫师用的。\n");
	if (! s) return notify_fail("先开一局远征（yuanzheng）。\n");
	if (n < 1 || n > sizeof(stages)) return notify_fail("关卡是 1 到 " + sizeof(stages) + "。\n");
	clean_world(me);
	map_delete(s, "event");
	map_delete(s, "planning");
	s["stage"] = n - 1;
	me->set_temp("yuanzheng", s);
	save_run(me);
	begin_stage(me);
	return 1;
}

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

// 这一下有没有「人」在动手。中毒、陷阱、从高处摔下来都算不掉命：
// 没人在打你的死，远征不认。身上有一笔遗留的伤害来源 temp 时也按有人算——
// 打斗的人走开了还可能接着掉血。
int by_hand(object me)
{
	object who;

	if (in_battle(me)) return 1;
	// 局内对手刚倒下、刚被收走，房间里已经没人了，但这一下伤确实是他打的
	if (time() - (int)me->query_temp("yz_fought_at") <= 5) return 1;
	if (objectp(who = me->query_temp("last_damage_from")) && objectp(environment(who)) &&
	    environment(who) == environment(me))
		return 1;
	return 0;
}

int on_die(object me)
{
	mapping s = state(me);
	int own, lost;

	if (! s) return 0;
	// 正在正常游玩（身边没有在打的人和局里的目标）时死了，不该拿远征的命来抵
	own = by_hand(me);
	// 只剩最后一条命时不再豁免：一条命都拿来兜底就等于没有终点
	if (s["life"] > 1 && ! own)
	{
		if (by_hand(me))
			tell_object(me, HIY "（这一下不是在关卡里打出来的，远征的 " + s["life"] +
				" 条命还在。接着打就打 yuanzheng resume。）" NOR "\n");
		else
			tell_object(me, HIY "（这一下不是人打的，远征的 " + s["life"] +
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
		tell_object(me, HIY "免死符烧成一道黄光，替你挡下了这一下。" NOR "\n");
		return 1;
	}
	s["life"] -= 1;
	s["deaths"] = (s["deaths"] || 0) + 1;
	if (s["life"] <= 0)
	{
		// 输了也按过了几关给一点声望，不然高难度失败一局等于白打，商店永远买不起
		lost = s["stage"] * 2;
		if (s["tier"] > 0) lost += lost * s["tier"] * 50 / 100;
		if (lost > 0)
		{
			me->add("yuanzheng/prestige", lost);
			me->add("yuanzheng/earned", lost);
		}
		tell_object(me, HIR "命都用完了，本局远征结束。局内天赋消散。" NOR "\n" +
			"这一局打到「" + (s["stage"] < sizeof(stages) ? def_at(s, s["stage"])["title"] : "终局") +
			"」，过了 " + s["stage"] + " 关，用时 " + fmt_time(time() - s["started"]) + "。" +
			(lost > 0 ? "按过关数带回远征声望 " + lost + " 点。" : "一关没过，没带回声望。") + "\n" +
			"想再来的话，点顶栏重开一局；远征商店里的「命硬」能多一条命。\n");
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
	tell_object(me, HIR "你在远征中倒下了！还剩 " + s["life"] + " 条命，已被送回" + city_of(me)["name"] + "·" + room_name(city_of(me)["inn"]) + "。这一关得重来。" NOR);
	if (s["life"] <= 1)
		tell_object(me, HIR "（再倒下一次，这一局就结束了。）" NOR);
	tell_object(me, "\n");
	// 顶栏的命数要跟着变，不然玩家看着还是 3/3
	tell_object(me, "YZ#" + status_line(me) + "\n");
	return 1;
}

// ---------- 状态与入口 ----------

string status(object me)
{
	mapping s = state(me), def;

	if (! s) return "尚未开始远征。";
	if (s["stage"] >= sizeof(stages))
		return sprintf("五关已经全部通过，可以结算。\n生命：%d/%d　属性点：%d%s\n天赋：%s\n远征声望：%d",
			s["life"], s["max_life"] || MAX_LIFE, s["points"],
			s["points"] > 0 ? "（还没选：yuanzheng choose 1-3）" : "",
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
	return sprintf("%s\n  目标：%s\n  地点：%s·%s\n生命：%d/%d　属性点：%d%s　铜钱：%d\n天赋：%s\n远征声望：%d",
		def["title"], def["hint"], city_of(me)["name"], room_name(stage_room(me, def)),
		s["life"], s["max_life"] || MAX_LIFE, s["points"],
		s["points"] > 0 ? "（还没选：yuanzheng choose 1-3）" : "",
		s["coin"] || 0,
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
		str += "这一批货卖完了（过一关换新货）:look" ZJSEP;
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
	{
		// 买不起也把摊子留着，好换一件
		tell_object(me, "铜钱不够（要 " + it["cost"] + " 钱，你有 " + (s["coin"] || 0) + " 钱）。\n");
		stall(me);
		return 1;
	}
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
	stall(me);
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
	if (me->query("yuanzheng/max_tier"))
		str += "\n难度：下一局「" + tier_name(tier_of(me)) + "」，最高解锁「" + tier_name(me->query("yuanzheng/max_tier")) + "」";
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

// 难度：打通一档解锁下一档，敌人更硬、结算声望更多。0 档就是原来的远征
int tier_of(object me)
{
	int t = me->query("yuanzheng/tier"), top = me->query("yuanzheng/max_tier");

	if (t > top) t = top;
	return t < 0 ? 0 : t;
}

string tier_name(int t)
{
	return t > 0 ? "险" + chinese_number(t) : "寻常";
}

int set_tier(object me, int n)
{
	int top = me->query("yuanzheng/max_tier");

	if (! intp(n) || n < 0 || n > top)
		return notify_fail("现在能选的难度是 0 到 " + top + "（每打通一档解锁下一档）。\n");
	me->set("yuanzheng/tier", n);
	tell_object(me, "下一局的难度定为「" + tier_name(n) + "」" +
		(n ? "：敌人气血多 " + (n * 30) + "%、出手更重，结算声望多 " + (n * 50) + "%。" : "。") + "\n");
	style_menu(me);
	return 1;
}

void style_menu(object me)
{
	int top = me->query("yuanzheng/max_tier"), t = tier_of(me), i;
	string tiers = "";

	if (top > 0)
	{
		for (i = 0; i <= top; i++)
			if (i != t) tiers += "难度：" + tier_name(i) + ":yuanzheng tier " + i + ZJSEP;
	}
	tell_object(me, ZJOBLONG "选一个流派开局" + (top > 0 ? "（难度：" + tier_name(t) + "）" : "") + "\n" +
		"剑客：长剑 + 剑法，招架稳，出手快\n" +
		"拳师：空手 + 拳脚，身法最灵，贴身短打\n" +
		"刀客：单刀 + 刀法，血厚甲硬，一刀是一刀\n" +
		ZJOBACTS2 + ZJMENUF(3, 3, 8, 30) +
		"剑客:yuanzheng start sword" ZJSEP +
		"拳师:yuanzheng start fist" ZJSEP +
		"刀客:yuanzheng start blade" + (sizeof(tiers) ? ZJSEP + tiers[0..<sizeof(ZJSEP)+1] : "") + "\n");
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
	       "order":({0,1,2,3,4}), "planning":1, "tier":tier_of(me) ]);
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
	tell_object(me, "你以" + st["name"] + "的身份踏上了江湖远征：五关，" + s["life"] + " 条命" +
		(s["tier"] ? "，难度「" + tier_name(s["tier"]) + "」" : "") + "。\n" +
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
	base = talent_base(s, pool);
	t = pool[(base + n - 1) % sizeof(pool)];
	apply_talent(me, t);
	s["talents"] += ({ t["name"] });
	s["points"] -= 1;
	me->set_temp("yuanzheng", s);
	save_run(me);
	tell_object(me, "你选择了天赋【" + t["name"] + "】：" + t["desc"] + "。\n");
	// 一关给了两点时，选完一个接着弹下一张，不用再去菜单里找
	if (s["points"] > 0) talent_menu(me);
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
	string *extra = ({ YZ_SPOIL_ARMOR, YZ_SPOIL_BOOTS, YZ_SPOIL_MIRROR });
	string *got = ({});

	file = spoil_file(style);
	while (n-- > 0)
	{
		object ob;
		// 第二件起从护具里挑一件没拿过的，免得开局背两把一样的剑、只能用一把
		if (member_array(file, got) >= 0)
		{
			string *left = extra - got;
			if (! sizeof(left)) break;
			file = left[random(sizeof(left))];
		}
		got += ({ file });
		ob = new(file);
		if (! objectp(ob)) continue;
		// 局内借来的兵器靠这个标记在结算时收回；战利品只记自己的标记，
		// 否则下一关清场时会被清掉、玩家也留不住它
		ob->set("yz_start_spoil", 1);
		ob->move(me, 1);
		if (ob->query("armor_prop/armor")) ob->wear();
		else ob->wield();
		nm = (nm ? nm + "、" : "") + (ob->query("name") || "战利品");
	}
	tell_object(me, "（行囊里带着上次的" + (nm || "战利品") + "，已经穿上）\n");
}

// 战利品按流派给，另外偶尔掉一件「江湖货」：防御护腕/轻快靴子/结实护心镜
string spoil_file(string style)
{
	string *pool = ({ YZ_SPOIL_ARMOR, YZ_SPOIL_BOOTS, YZ_SPOIL_MIRROR });

	if (style == "sword") return YZ_SPOIL_SWORD;
	if (style == "blade") return YZ_SPOIL_BLADE;
	if (random(3) == 0) return pool[random(sizeof(pool))];
	return YZ_SPOIL_ARMOR;
}

void give_spoil(object me, string style)
{
	string file;
	object ob;

	file = spoil_file(style);
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
	if (s["tier"] > 0) gain += gain * s["tier"] * 50 / 100;
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
		"想再来一局的话，点顶栏重开。\n");
	if (s["tier"] >= me->query("yuanzheng/max_tier") && s["tier"] < MAX_TIER)
	{
		me->set("yuanzheng/max_tier", s["tier"] + 1);
		me->set("yuanzheng/tier", s["tier"] + 1);
		tell_object(me, HIY "解锁新难度「" + tier_name(s["tier"] + 1) + "」：敌人更硬，结算声望更多。下一局默认就是它，开局时也能改回去。" NOR "\n");
	}
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
