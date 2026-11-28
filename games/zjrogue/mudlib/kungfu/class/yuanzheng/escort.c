// 江湖远征「押一趟镖」里跟着玩家走的镖师：倒了就算这趟白跑
// 跟人靠 team.c 的 set_leader/follow_me：玩家走一步，他跟着走一步
#include <ansi.h>

inherit NPC;

void create()
{
	set_name("镖师", ({ "biaoshi", "escort" }));
	set("gender", "男性");
	set("age", 36);
	set("long", "一个赶了半辈子镖的老江湖，怀里抱着夹板，眼睛四下里瞄，嘴里念着「太平无事」。\n");
	set("attitude", "peaceful");
	set("str", 24);
	set("con", 24);
	set("max_qi", 420);
	set("eff_qi", 420);
	set("qi", 420);
	set("max_jing", 200);
	set("eff_jing", 200);
	set("jing", 200);
	set("combat_exp", 30000);
	set_skill("dodge", 60);
	set_skill("parry", 60);
	set_skill("blade", 60);
	set_skill("strike", 40);
	set_skill("force", 50);
	setup();
	carry_object("/clone/weapon/gangdao")->wield();
}

// 玩家走太快、他一时没跟上的时候，隔一拍直接补到玩家身边
void heart_beat()
{
	object env, who;

	::heart_beat();
	if (! objectp(who = query_leader())) return;
	if (! objectp(env = environment(who))) return;
	if (env == environment()) return;
	move(env);
}

void die()
{
	object who = query_leader();

	message_vision(HIR "$N" HIR "腿上挨了一记，扑倒在地：「这趟…走不成了…」" NOR "\n", this_object());
	if (objectp(who)) call_other("/adm/daemons/yuanzhengd", "escort_failed", who);
	destruct(this_object());
}
