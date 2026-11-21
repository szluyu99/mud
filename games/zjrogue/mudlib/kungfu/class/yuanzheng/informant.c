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
	setup();
}

mixed accept_ask(object me, string topic)
{
	if (topic != "远征" && topic != "远征线索")
		return 0;
	if (! objectp(me) || ! userp(me)) return 0;
	YZ_D->ask_done(me, this_object());
	return "匪首今晚就在广场聚众，要动手去南大街，匪首今晚就在广场聚众。";
}

void unconcious() { }
