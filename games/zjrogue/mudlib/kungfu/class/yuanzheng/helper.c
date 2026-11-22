// 江湖远征：守卫喊来的帮手。只认自己的主人，打不着局内目标，也不会让关卡算过。
#include <ansi.h>

inherit NPC;

void create()
{
	::create();
	set("gender", "男性");
	set("age", 20 + random(15));
	set("attitude", "aggressive");
	set("no_get", 1);
	set("chat_chance", 0);
	set("chat_chance_combat", 60);
	set("is_stay_in_room", 1);
	set("jiali", 0);
	set_name("帮闲", ({ "bangxian", "helper" }));
	setup();
}

void setup_from_ally(string owner, int stage)
{
	if (stage < 1) stage = 1;
	set("yz_ally", 1);
	set("yz_owner", owner);
	set("yz_stage", stage);
	set("max_qi", 60 + stage * 20);
	set("eff_qi", 60 + stage * 20);
	set("qi", 60 + stage * 20);
	set("max_jing", 60 + stage * 10);
	set("eff_jing", 60 + stage * 10);
	set("jing", 60 + stage * 10);
	set_skill("unarmed", 10 + stage * 8);
	set_skill("dodge", 0);
	set_skill("parry", 0);
	set_skill("force", 10 + stage * 8);
	add_temp("apply/damage", stage * 2);
	add_temp("apply/defense", -10);
	set("title", HIR "帮闲" NOR);
}

// 帮手不是正主：倒了就倒了，不能算远征目标
void die(object killer)
{
	object env = environment();
	set_temp("yz_dead", 1);
	set("qi", query("max_qi"));
	set("eff_qi", query("max_qi"));
	if (objectp(env))
		tell_room(env, HIY + query("name") + HIY "挨了几下，连滚带爬地跑了。\n" NOR, ({ this_object() }));
	call_out("vanish", 1);
}

void vanish()
{
	if (objectp(this_object())) destruct(this_object());
}

void heart_beat()
{
	::heart_beat();
	if (! objectp(this_object())) return;
	if (query_temp("yz_dead")) return;
	if (query("qi") * 5 <= query("max_qi"))
	{
		die(0);
		return;
	}
	// 主人走了，帮手也就散了
	if (! objectp(find_player(query("yz_owner"))) && ! query_temp("yz_leave"))
	{
		set_temp("yz_leave", 1);
		call_out("vanish", 3);
	}
}
