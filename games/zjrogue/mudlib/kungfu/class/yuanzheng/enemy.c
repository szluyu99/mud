// 江湖远征的敌人：不带武器、技能按关卡给，强度可控，死亡时回报给远征 daemon。
#include <ansi.h>

inherit NPC;

#define YZ_D "/adm/daemons/yuanzhengd"

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
	qi = 160 + stage * 130 + (kind == "boss" ? 160 : 0);

	set("str", 18 + stage * 2);
	set("con", 18 + stage * 2);
	set("dex", 18 + stage * 2);
	set("max_jing", 100 + stage * 20);
	set("eff_jing", 100 + stage * 20);
	set("jing", 100 + stage * 20);
	set("max_neili", 100 + stage * 60);
	set("neili", 100 + stage * 60);
	set("jiali", 0);
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
	int r = ::receive_damage(type, damage, who);

	if (type == "qi" && objectp(this_object()) && ! query_temp("yz_dead") &&
	    query("qi") * 4 <= query("max_qi"))
		die(who);
	return r;
}

void heart_beat()
{
	::heart_beat();
	if (! objectp(this_object()) || query_temp("yz_dead")) return;
	if (query("qi") > 0 && query("qi") * 4 <= query("max_qi"))
		die(query_temp("last_damage_from"));
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
	if (! objectp(killer)) killer = find_owner();
	if (objectp(env))
		tell_room(env, HIR + me->query("name") + HIR "闷哼一声，倒了下去。\n" NOR, ({ me }));
	YZ_D->enemy_died(killer, me);
	call_out("vanish", 1);
}
