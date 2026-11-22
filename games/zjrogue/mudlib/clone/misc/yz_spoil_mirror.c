// 远征战利品：偶尔掉出来的护心镜，硬得很
#include <armor.h>

inherit CLOTH;

void create()
{
	set_name("远征护心镜", ({ "yuanzheng mirror", "mirror", "hu xin jing" }));
	set_weight(2200);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "面");
		set("long", "铜面上有几道深痕，都是替人挡下来的。\n");
		set("value", 380);
		set("material", "iron");
		set("armor_prop/armor", 32);
	}
	setup();
}
