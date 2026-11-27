// 江湖远征的线人：对他说「ask xianren about 远征」就能拿到下一步线索。
#include <ansi.h>

inherit NPC;

#define YZ_D "/adm/daemons/yuanzhengd"

void create()
{
	set_name("线人", ({ "xianren", "informant" }));
	set("title", HIC "江湖线人" NOR);
	set("gender", "男性");
	set("age", 40);
	set("long", "一个缩在角落里的人，眼神四处乱飘，像是在等什么人。\n");
	set("attitude", "friendly");
	set("can_speak", 1);
	set("no_get", 1);
	set("no_guard", 1);
	set("str", 20);
	set("con", 20);
	set("dex", 20);
	set("int", 20);
	set("max_qi", 500);
	set("eff_qi", 500);
	set("qi", 500);
	set("combat_exp", 10000);
	set("shen_type", 1);
	// 有 inquiry 才会在点开时出「远征」按钮，不然玩家点开线人只看得到「杀死」
	set("inquiry", ([ "远征" : (: call_other, __FILE__, "inquiry_yz" :) ]));
	setup();
}

mixed inquiry_yz()
{
	return accept_ask(this_player(), "远征");
}

mixed accept_ask(object me, string topic)
{
	if (topic != "远征" && topic != "远征线索")
		return 0;
	if (! objectp(me) || ! userp(me)) return 0;
	YZ_D->ask_done(me, this_object());
	return "匪首手下有个副手，这两天在城门一带转悠；先把他截下，匪首就成了光杆。" +
		YZ_D->boss_tip(me);
}

void unconcious() { }

// 线人是来递话的：被人动手就缩成一团，把话说了，免得玩家以为要打死他
int accept_fight(object who) { return 0; }
int accept_hit(object who)
{
	if (objectp(who) && userp(who))
	{
		command("say 别动手别动手！要问就问「远征」的事（ask xianren about 远征）。");
		YZ_D->ask_done(who, this_object());
	}
	return -1;
}
int accept_kill(object who) { return accept_hit(who); }
