// 江湖远征的敌人：不带武器、技能按关卡给，强度可控，死亡时回报给远征 daemon。
#include <ansi.h>

inherit NPC;

#define YZ_D "/adm/daemons/yuanzhengd"
#define YZ_ALLY "/kungfu/class/yuanzheng/helper"

object find_owner();
int near_dead();
int owner_rare(object who, string id);

void create()
{
	::create();
	set("gender", "男性");
	set("age", 25 + random(20));
	set("attitude", "aggressive");
	set("no_get", 1);
	set("no_guard", 1);
	set("chat_chance", 0);
	set("chat_chance_combat", 80);
	set("is_stay_in_room", 1);
	set("str", 20);
	set("con", 20);
	set("dex", 20);
	set("int", 20);
	set("per", 20);
	set("kar", 20);
	set("jiali", 0);
	set("max_neili", 100);
	set("neili", 100);
	set("max_jing", 100);
	set("jing", 100);
	set("max_qi", 100);
	set("qi", 100);
	set("combat_exp", 200);
	set_skill("unarmed", 5);
	set_skill("dodge", 5);
	set_skill("parry", 5);
	set_skill("force", 5);
	set_name("恶汉", ({ "ehan", "enemy", "yuanzheng" }));
	setup();
}

void setup_from(object me, int stage, string kind, string cname, string cid)
{
	int lvl, qi;

	set_name(cname || "恶汉", ({ (cid || "ehan"), "enemy", "yuanzheng" }));
	setup();

	lvl = 5 + stage * 12;
	// 局内给了流派底子之后，原来那点血一两下就没了；按关卡抬上来，一关大约四五下
	qi = 110 + stage * 80 + (kind == "boss" ? 140 : 0) + (kind == "guard" ? 10 : 0);

	set("str", 18 + stage * 2);
	set("con", 18 + stage * 2);
	set("dex", 18 + stage * 2);
	set("max_jing", 100 + stage * 20);
	set("eff_jing", 100 + stage * 20);
	set("jing", 100 + stage * 20);
	set("max_neili", 100 + stage * 60);
	set("neili", 100 + stage * 60);
	set("jiali", 0);
	// 寻常档故意让敌人几乎打不中（出手值算出来是 0）；险档在 yuanzhengd spawn 里补经验
	set("combat_exp", 10 + stage * 100);

	set_skill("unarmed", lvl);
	set_skill("dodge", 0);
	set_skill("parry", 0);
	set_skill("force", lvl);

	add_temp("apply/damage", stage * 3);
	add_temp("apply/unarmed_damage", stage * 3);
	add_temp("apply/armor", stage * 5);
	// 新手玩家的命中本来就很差，把敌人防御压低，保证几拳就能解决
	add_temp("apply/defense", -20 - stage * 5);

	set("yz_stage", stage);
	set("yz_kind", kind);
	set("yz_owner", me->query("id"));
	set("shen_type", -1);
	set("shen", -100);
	set("title", kind == "boss" ? HIR "远征匪首" NOR : HIR "远征对手" NOR);

	// 打晕直接算死，别走 NPC 的昏倒/搬走流程
	set_override("unconcious", (: call_other, __FILE__, "go_die" :));

	// setup() 会按 con/force 重算气血，所以这两个值必须最后写
	set("max_qi", qi);
	set("eff_qi", qi);
	set("qi", qi);
}

// 剩四分之一血就算被打倒：走原版逻辑会先喊一句「昏了过去」再把 NPC 搬走，
// 那套流程对远征的对手没有意义，还会在搬动时打断战斗。
// 判定放在 receive_damage 里，是因为一拳可能直接打穿这四分之一血。
varargs int receive_damage(string type, int damage, object who)
{
	int r;

	// 三个流派的出手方式不同：剑客靠连招叠伤害，拳师每三下一记寸劲，
	// 刀客自己血越少越狠。加成只算在这个对手身上，换关就重新数。
	damage = style_damage(type, damage, who);
	r = ::receive_damage(type, damage, who);

	if (! objectp(this_object()) || query_temp("yz_dead")) return r;

	// 匪首剩一半血时会红了眼：先判这个再判生死，否则一拳打穿五十到二十五
	// 的区间就永远看不到。
	if (query("yz_kind") == "boss" && ! query_temp("yz_rage") &&
	    query("qi") * 2 <= query("max_qi"))
	{
		set_temp("yz_rage", 1);
		add_temp("apply/attack", 10);
		message_vision(HIR "$N把牙一咬，眼睛红了，出手一下子狠了起来！\n" NOR, this_object());
	}
	// 稀有天赋「嗜血」：打中回一成伤害的气血
	if (type == "qi" && objectp(who) && userp(who) && damage > 0 && owner_rare(who, "leech"))
	{
		int heal = damage / 10;
		if (heal < 1) heal = 1;
		who->set("eff_qi", who->query("eff_qi") + heal > who->query("max_qi") ? who->query("max_qi") : who->query("eff_qi") + heal);
		who->set("qi", who->query("qi") + heal > who->query("eff_qi") ? who->query("eff_qi") : who->query("qi") + heal);
	}
	if (type == "qi" && near_dead())
		die(who);
	return r;
}

// 玩家的局里有没有这张稀有天赋
int owner_rare(object who, string id)
{
	mapping s;
	if (! objectp(who) || ! mapp(s = YZ_D->state(who))) return 0;
	return YZ_D->has_rare(s, id);
}

// 平时四分之一血就倒；有「看破」时三成血就倒
int near_dead()
{
	object owner = find_owner();
	if (query("qi") <= 0) return 0;
	if (objectp(owner) && owner_rare(owner, "break"))
		return query("qi") * 10 <= query("max_qi") * 3;
	return query("qi") * 4 <= query("max_qi");
}

int style_damage(string type, int damage, object who)
{
	string style;
	int hits, t;

	if (type != "qi" || ! objectp(who)) return damage;
	style = query("yz_style");
	if (! stringp(style)) return damage;

	t = time();
	// 五秒没接着打，连招就断了（浏览器里两拳之间有时会拖到三秒多）
	hits = (t - query_temp("yz_last") > 5) ? 1 : query_temp("yz_hits") + 1;
	set_temp("yz_hits", hits);
	set_temp("yz_last", t);

	if (style == "sword")
	{
		if (hits >= 2)
		{
			// 剑客兵器最轻（长剑 25，大刀 40，拳师另有 +50 空手伤害），连招叠得更高来补：
			// 第 2 下 +10%，每多一下 +10%，第 6 下起封顶 +50%
			damage += damage * (hits > 6 ? 5 : hits - 1) / 10;
			if (hits == 3)
				message_vision(HIC "$N剑势连绵，一记快似一记！\n" NOR, who);
			else if (hits == 6)
				message_vision(HIC "$N剑意已成，剑光连成一片！\n" NOR, who);
		}
	}
	else if (style == "fist")
	{
		if (hits % 3 == 0)
		{
			damage *= 2;
			message_vision(HIY "$N沉肩坐马，一记寸劲打在$n胸口！\n" NOR, who, this_object());
		}
	}
	else if (style == "blade")
	{
		if (who->query("qi") * 2 <= who->query("max_qi"))
		{
			damage += damage / 4;
			if (hits % 2 == 0)
				message_vision(HIR "$N身上带着血，刀法反倒更凶了！\n" NOR, who);
		}
	}
	return damage;
}

// ---------- 三种敌人各有各的脾气 ----------
// 恶汉（thug）：纯数值，入门关
// 守卫（guard）：每七秒喊一嗓子，招呼一个帮手一起上
// 副手（vice）：血掉到三成就掉头跑，跑掉了这一关得重来
void guard_shout()
{
	object room, ob, who;
	object *allies;

	if (! objectp(this_object()) || query_temp("yz_dead")) return;
	if (! objectp(room = environment(this_object()))) return;
	// 只招呼真动手的玩家：帮闲把自己人当仇家，会越喊越多，把场子搅烂
	who = query_last_damage_from();
	if (! objectp(who) || ! userp(who)) return;
	if (query_temp("yz_shout") && time() - query_temp("yz_shout") < 7) return;
	set_temp("yz_shout", time());
	// 一关最多喊两个帮手，人手也是有限的
	allies = filter_array(all_inventory(room), (: objectp($1) && $1->query("yz_ally") :));
	if (sizeof(allies) >= 2) return;
	if (query("yz_kind") == "boss")
		message_vision(HIR "$N一声呼哨：「弟兄们，都给我上！」\n" NOR, this_object());
	else
		message_vision(HIR "$N扯着嗓子喊了起来：「来人哪！有人要抢东西！」\n" NOR, this_object());
	ob = new(YZ_ALLY);
	if (! objectp(ob)) return;
	ob->setup_from_ally(query("yz_owner"), query("yz_stage"));
	ob->move(room);
	ob->kill_ob(who);
}

void vice_fled()
{
	object room, owner = find_owner();

	if (! objectp(this_object()) || query_temp("yz_dead")) return;
	room = environment(this_object());
	set_temp("yz_dead", 1);
	set("qi", query("max_qi"));
	set("eff_qi", query("max_qi"));
	remove_all_killer();
	remove_all_enemy(1);
	if (objectp(room))
		tell_room(room, HIY + query("name") + HIY "见势不妙，一转身钻进巷子跑了。\n" NOR, ({ this_object() }));
	if (objectp(owner))
		YZ_D->enemy_fled(owner, this_object(), room ? base_name(room) : "");
	call_out("vanish", 1);
}

void heart_beat()
{
	object who;

	::heart_beat();
	if (! objectp(this_object()) || query_temp("yz_dead")) return;
	// 给正在跟我打的玩家记一笔：他这几秒里倒下，就是远征里的打斗（见 yuanzhengd by_hand）
	foreach (who in query_enemy())
		if (objectp(who) && userp(who)) who->set_temp("yz_fought_at", time());
	if (near_dead())
		die(query_last_damage_from());
	// 副手三成血开跑，但离倒下只差几拳的时候就不跑了，否则快到手的窗口一下全白费。
	// 逃跑这条路得撞上两次才跑得掉（撞一次摔一跤、掉三成血），玩家至少有把手拦一拦。
	who = query_last_damage_from();
	if (query("yz_kind") == "vice" && objectp(who) && query("qi") * 10 <= query("max_qi") * 3 && query("qi") * 20 > query("max_qi"))
	{
		if (! query_temp("yz_escape") && userp(who) && environment(who) == environment(this_object()))
		{
			set_temp("yz_escape", 1);
			set("qi", query("qi") * 7 / 10);
			message_vision(HIR "$N往巷口一钻，被$n一把揪了回来！\n" NOR, this_object(), who);
		}
		else
			vice_fled();
	}
	if (query("yz_kind") == "guard" && objectp(query_last_damage_from()))
		guard_shout();
	if (query("yz_kind") == "boss")
	{
		object owner;
		// 逃走的匪首被追上就先动手：玩家追过来时常常只剩三成血，
		// 自己按「杀死」会被「你已经没有多余力气战斗了」挡住，两边就干站着
		if (query_temp("yz_fled") && ! is_fighting() && objectp(owner = find_owner()) &&
		    environment(owner) == environment(this_object()))
		{
			message_vision(HIR "$N见躲不过去，咬牙朝$n扑了过来！\n" NOR, this_object(), owner);
			kill_ob(owner);
			owner->kill_ob(this_object());
		}
		boss_trick();
	}
}

// ---------- 终局匪首各有一手（yz_boss，见 yuanzhengd bosses） ----------
// 啸山虎：和守卫一样喊人；毒蝎娘子：隔一阵毒气上身；滑头李三：半血开溜，换个地方再打；
// 铁指判官：隔一阵点穴，被点中的人愣两下。
object boss_target()
{
	// 正在跟我打、又和我在同一处的玩家（last_damage_from 是 damage.c 的 nosave 变量，不在 temp 里）
	foreach (object who in query_enemy())
		if (objectp(who) && userp(who) && environment(who) == environment(this_object()))
			return who;
	return 0;
}

void boss_trick()
{
	string kind = query("yz_boss");
	object who, room, owner;
	int t = time(), n;

	if (! stringp(kind) || ! objectp(who = boss_target())) return;
	// 开场白放在头一回交手：刷出来时玩家多半还在路上，听不见
	if (! query_temp("yz_said") && stringp(query("yz_intro")))
	{
		set_temp("yz_said", 1);
		tell_room(environment(this_object()), HIY + query("yz_intro") + "\n" NOR);
	}
	if (kind == "shout")
	{
		guard_shout();
		return;
	}
	if (kind == "poison")
	{
		if (t - query_temp("yz_trick") < 6) return;
		set_temp("yz_trick", t);
		n = who->query("max_qi") * 4 / 100 + query("yz_stage") * 2 + query("yz_tier") * 3;
		message_vision(HIG "$N指尖一划，$n伤口发黑，毒气往上走了一截！\n" NOR, this_object(), who);
		who->receive_damage("qi", n, this_object());
		return;
	}
	if (kind == "dian")
	{
		if (t - query_temp("yz_trick") < 9) return;
		set_temp("yz_trick", t);
		message_vision(HIM "$N两指一并，点在$n肩井穴上，$n半边身子一麻！\n" NOR, this_object(), who);
		who->start_busy(2);
		return;
	}
	if (kind == "flee" && ! query_temp("yz_fled") && query("qi") * 2 <= query("max_qi"))
	{
		string to;

		if (! objectp(room = environment(this_object()))) return;
		owner = find_owner();
		to = objectp(owner) ? YZ_D->flee_room(owner, base_name(room)) : 0;
		if (! stringp(to) || ! objectp(load_object(to))) return;
		set_temp("yz_fled", 1);
		remove_all_killer();
		remove_all_enemy(1);
		tell_room(room, HIY "滑头李三虚晃一招，撒腿就跑：「好汉饶命，后会有期！」\n" NOR, ({ this_object() }));
		move(to);
		tell_room(environment(this_object()), HIY "滑头李三气喘吁吁地跑了过来，四下张望。\n" NOR, ({ this_object() }));
		if (objectp(owner)) YZ_D->boss_moved(owner, to);
	}
}

object find_owner()
{
	object ob;
	string id = query("yz_owner");

	if (stringp(id) && objectp(ob = find_player(id))) return ob;
	foreach (ob in users())
		if (objectp(ob) && ob->query("yuanzheng/run")) return ob;
	return 0;
}

void vanish()
{
	if (objectp(this_object())) destruct(this_object());
}

void go_die()
{
	die(0);
}

void die(object killer)
{
	object me = this_object();
	object env = environment(me);

	if (query_temp("yz_dead")) return;
	set_temp("yz_dead", 1);
	// 血条顶回去：这一刻外面还在跑 combatd 的判定，气血小于零会再喊一句「昏了过去」，
	// 下一秒这个对象就被清场了，所以这里只要让它别触发二次死亡就够了
	set("qi", query("max_qi"));
	set("eff_qi", query("max_qi"));
	// 倒下这一刻就停手：对象要等一秒才清掉，这一秒里心跳还会出招，
	// 关卡已经算完了再打死玩家，远征就不认这一下（玩家白白死一次）
	remove_all_killer();
	remove_all_enemy(1);
	if (! objectp(killer)) killer = find_owner();
	if (objectp(env))
		tell_room(env, HIR + me->query("name") + HIR "闷哼一声，倒了下去。\n" NOR, ({ me }));
	if (objectp(env) && query("yz_kind") == "vice" && stringp(query("yz_boss_name")))
		tell_room(env, HIY "副手临倒下还啐了一口：「" + query("yz_boss_name") +
			"不会放过你的……」\n" NOR, ({ me }));
	YZ_D->enemy_died(killer, me);
	call_out("vanish", 1);
}
