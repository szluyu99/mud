// 远征战利品：拳师通关后带回的护腕
#include <armor.h>

inherit CLOTH;

void create()
{
	set_name("远征护腕", ({ "yuanzheng bracer", "bracer", "hu wan" }));
	set_weight(1200);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "副");
		set("long", "皮子磨得发亮，看得出挡过不少拳脚。\n");
		set("value", 300);
		set("material", "leather");
		set("armor_prop/armor", 20);
	}
	setup();
}
