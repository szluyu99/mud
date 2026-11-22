// 远征战利品：偶尔掉出来的轻快靴子，身法好用
#include <armor.h>

inherit CLOTH;

void create()
{
	set_name("远征快靴", ({ "yuanzheng boots", "boots", "kuai xue" }));
	set_weight(900);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "双");
		set("long", "鞋底缠着旧布条，走夜路不出声。\n");
		set("value", 320);
		set("material", "leather");
		set("armor_prop/armor", 8);
		set("armor_prop/dodge", 5);
	}
	setup();
}
