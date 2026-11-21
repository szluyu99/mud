// 远征战利品：剑客通关后带回的长剑
#include <weapon.h>

inherit SWORD;

void create()
{
	set_name("远征长剑", ({ "yuanzheng sword", "sword", "jian" }));
	set_weight(5200);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "柄");
		set("long", "剑身有一道浅浅的血槽，像是从某场远征里带回来的。\n");
		set("value", 400);
		set("material", "steel");
		set("wield_msg", "$N「唰」的一声抽出一柄$n握在手中。\n");
		set("unwield_msg", "$N将手中的$n插回剑鞘。\n");
	}
	init_sword(45);
	setup();
}
