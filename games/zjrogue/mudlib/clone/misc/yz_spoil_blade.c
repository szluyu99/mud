// 远征战利品：刀客通关后带回的单刀
#include <weapon.h>

inherit BLADE;

void create()
{
	set_name("远征单刀", ({ "yuanzheng blade", "blade", "dao" }));
	set_weight(6000);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "柄");
		set("long", "刀口有几处崩了，却还透着股狠劲。\n");
		set("value", 400);
		set("material", "steel");
		set("wield_msg", "$N把$n往手里一沉，刀锋朝外。\n");
		set("unwield_msg", "$N收刀入鞘。\n");
	}
	init_blade(50);
	setup();
}
