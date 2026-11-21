// 江湖远征：当铺守卫身上的宝物，要带回客栈上交。
#include <ansi.h>

inherit ITEM;

void create()
{
	set_name(HIY "远征宝物" NOR, ({ "treasure", "baowu" }));
	set_weight(800);
	if (clonep())
		set_default_object(__FILE__);
	else {
		set("unit", "件");
		set("long", "一件镶着暗纹的旧物，正是匪首四处搜罗的东西。\n");
		set("value", 0);
		set("no_sell", 1);
		set("no_store", 1);
	}
	setup();
}

int query_autoload() { return 0; }
