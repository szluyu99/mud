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

mapping *talents = ({
	([ "name":"铁骨", "desc":"气血上限 +120", "key":"max_qi", "value":120 ]),
	([ "name":"轻身", "desc":"闪避 +12", "key":"dodge", "value":12 ]),
	([ "name":"破甲", "desc":"攻击 +12", "key":"attack", "value":12 ]),
	([ "name":"护体", "desc":"防御 +12", "key":"defense", "value":12 ]),
	([ "name":"刀枪不入", "desc":"护甲 +25", "key":"armor", "value":25 ]),
	([ "name":"力拔山河", "desc":"伤害 +15", "key":"damage", "value":15 ]),
	([ "name":"凝神", "desc":"精力上限 +100", "key":"max_jingli", "value":100 ]),
	([ "name":"气海", "desc":"内力上限 +120", "key":"max_neili", "value":120 ]),
	([ "name":"根骨", "desc":"根骨 +2", "key":"con", "value":2 ]),
	([ "name":"身法", "desc":"身法 +2", "key":"dex", "value":2 ]),
	([ "name":"悟性", "desc":"悟性 +2", "key":"int", "value":2 ]),
	([ "name":"膂力", "desc":"膂力 +2", "key":"str", "value":2 ]),
	([ "name":"招架精通", "desc":"招架 +12", "key":"parry", "value":12 ]),
	([ "name":"内功护体", "desc":"防御 +20", "key":"defense", "value":20 ]),
	([ "name":"先发制人", "desc":"攻击 +20", "key":"attack", "value":20 ]),
	([ "name":"铜皮铁骨", "desc":"护甲 +40", "key":"armor", "value":40 ]),
	([ "name":"狂战", "desc":"伤害 +25", "key":"damage", "value":25 ]),
	([ "name":"回春", "desc":"气血上限 +220", "key":"max_qi", "value":220 ]),
	([ "name":"灵台清明", "desc":"精力上限 +220", "key":"max_jingli", "value":220 ]),
	([ "name":"深不可测", "desc":"内力上限 +220", "key":"max_neili", "value":220 ])
});

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

void clean_world(object me, int stage)
{
	object ob;

	foreach (ob in children(YZ_ENEMY))
		if (ob && ob->query("yz_owner") == me->query("id") &&
		    (stage < 0 || ob->query("yz_stage") == stage))
			destruct(ob);
	foreach (ob in children(YZ_INFO))
		if (ob && ob->query("yz_owner") == me->query("id"))
			destruct(ob);
}

mapping cur_stage(object me)
{
	mapping s = state(me);

	return s ? stages[s["stage"]] : 0;
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
	def = stages[s["stage"]];
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
	int i, base;
	string str;

	if (! s) return;
	base = (s["stage"] < 1 ? 0 : s["stage"] - 1) * 3;
	str = ZJOBLONG "选一个天赋（属性点：" + s["points"] + "）\n" ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	for (i = 0; i < 3; i++)
	{
		t = talents[(base + i) % sizeof(talents)];
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
	mapping s;

	if (! objectp(enemy)) return;
	id = enemy->query("yz_owner");
	if (! stringp(id)) return;
	if (! objectp(me = find_player(id))) return;
	if (! mapp(s = state(me))) return;
	if (enemy->query("yz_stage") != s["stage"]) return;

	if (stages[s["stage"]]["type"] == "item")
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
	mapping s = state(me);

	if (! s) return;
	if (stages[s["stage"]]["type"] != "ask") return;
	complete_stage(me);
}

// 交宝物
int submit(object me)
{
	mapping s = state(me);
	object env, t;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (stages[s["stage"]]["type"] != "item")
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
	def = stages[s["stage"]];
	if (s["stage"] >= sizeof(stages))
		return sprintf("五关已经全部通过，可以结算。\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
			s["life"], MAX_LIFE, s["points"],
			sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
			me->query("yuanzheng/prestige"));
	return sprintf("%s\n  目标：%s\n生命：%d/%d　属性点：%d\n天赋：%s\n远征声望：%d",
		def["title"], def["hint"], s["life"], MAX_LIFE, s["points"],
		sizeof(s["talents"]) ? implode(s["talents"], "、") : "无",
		me->query("yuanzheng/prestige"));
}

int start(object me)
{
	mapping s;

	if (state(me)) return notify_fail("你已经在远征途中，先结算（yuanzheng settle）或放弃（yuanzheng abandon）。\n");
	s = ([ "stage":0, "life":MAX_LIFE, "points":0, "talents":({}),
	       "buff":([]), "raw":([]), "started":time() ]);
	// 远征磨砺：新角色本身没有武功，不给点准头几乎打不中；结算时一并清掉
	s["buff"]["apply/attack"] = 20;
	s["buff"]["apply/damage"] = 40;
	s["buff"]["apply/unarmed_damage"] = 40;
	me->add_temp("apply/attack", 20);
	me->add_temp("apply/damage", 40);
	me->add_temp("apply/unarmed_damage", 40);
	// 关掉自动逃跑：远征的对手本来就不强，一跑出房间这一关就等于断了
	s["wimpy"] = me->query("env/wimpy");
	me->set("env/wimpy", 0);
	// 新角色没有武功，出手几乎打不中；局内借一段「基本功夫」，结算时还原
	s["skills"] = ([]);
	foreach (string sk in ({ "unarmed", "dodge", "parry", "force", "sword", "blade", "staff", "cuff", "finger", "strike", "hand", "claw" }))
	{
		int old = me->query_skill(sk);
		s["skills"][sk] = old;
		if (old < 60) me->set_skill(sk, old + 40);
	}
	// 经验差太多会被系统判成完全打不中，局内临时补一段；raw 记的是增量，结算时减回去
	me->add("combat_exp", 30000);
	s["raw"]["combat_exp"] = (s["raw"]["combat_exp"] || 0) + 30000;
	me->set_temp("yuanzheng", s);
	save_run(me);
	me->set_override("die", (: call_other, __FILE__, "on_die" :));
	tell_object(me, "你踏上了江湖远征：五关，三条命。\n" +
		"一、剿匪　二、夺宝　三、寻访　四、截杀　五、终局\n");
	begin_stage(me);
	return 1;
}

int choose(object me, int n)
{
	mapping s = state(me), t;
	int base;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["points"] < 1) return notify_fail("你没有可用的属性点。\n");
	if (n < 1 || n > 3) return notify_fail("请选择 1、2 或 3。\n");
	base = (s["stage"] < 1 ? 0 : s["stage"] - 1) * 3;
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

	if (! s) return notify_fail("你还没有开始远征。\n");
	tell_object(me, "你放弃了这次远征，局内天赋已经消散。\n");
	end_run(me);
	return 1;
}

int settle(object me)
{
	mapping s = state(me);
	int gain;

	if (! s) return notify_fail("你还没有开始远征。\n");
	if (s["stage"] < sizeof(stages)) return notify_fail("还有关卡没有通过，不能结算。\n");
	gain = 8 + sizeof(s["talents"]) * 2 + (s["life"] - 1) * 3;
	me->add("yuanzheng/prestige", gain);
	tell_object(me, "远征结算完成！五关全过，剩余 " + s["life"] + " 条命，获得远征声望 " +
		gain + " 点。局内天赋已经消散，不会带回普通江湖。\n");
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
