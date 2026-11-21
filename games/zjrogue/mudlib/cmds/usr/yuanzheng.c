// 江湖远征：zjrogue 单人局内成长模式。
#include <ansi.h>

#define YZ_D "/adm/daemons/yuanzhengd"

int menu(object me)
{
	mapping s;
	string str;

	YZ_D->ensure_world(me);
	s = me->query_temp("yuanzheng");
	str = ZJOBLONG "江湖远征\n" + YZ_D->status(me) + "\n";
	if (! s)
		str += "五关：剿匪、夺宝、寻访、截杀、终局。三条命，通关后结算远征声望。\n";
	else
		str += "提示：跟着「目标」做，打完点下面的按钮选天赋。\n";
	str += ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	if (! s)
		str += "开始远征:yuanzheng start" ZJSEP;
	else
	{
		str += "看当前目标:yuanzheng status" ZJSEP;
		if (s["points"] > 0)
			str += "选天赋:yuanzheng talents" ZJSEP;
		if (s["stage"] < 5)
			str += "上交宝物:yuanzheng submit" ZJSEP;
		else
			str += "结算远征:yuanzheng settle" ZJSEP;
		str += "放弃远征:yuanzheng abandon" ZJSEP;
	}
	write(str + "\n");
	return 1;
}

int main(object me, string arg)
{
	string sub;
	int n;

	if (! userp(me)) return 0;
	if (! arg || arg == "") return menu(me);
	if (sscanf(arg, "choose %d", n) == 1) return YZ_D->choose(me, n);
	if (sscanf(arg, "%s %d", sub, n) == 2 && sub == "choose") return YZ_D->choose(me, n);

	switch (arg)
	{
	case "start":	return YZ_D->start(me);
	case "status":	write(YZ_D->status(me) + "\n"); return 1;
	case "talents":	YZ_D->talent_menu(me); return 1;
	case "submit":	return YZ_D->submit(me);
	case "settle":	return YZ_D->settle(me);
	case "abandon":	return YZ_D->abandon(me);
	case "debugwin":	return YZ_D->debug_win(me);
	case "where":	return YZ_D->where(me);
	}
	return notify_fail("用法：yuanzheng（菜单）、start、status、choose 1-3、submit、settle、abandon。\n");
}

int help(object me)
{
	write("远征：五关依次是剿匪、夺宝、寻访、截杀、终局。每过一关得到 1 点属性点并三选一天赋；\n"
	      "三条命，倒下回客店；五关全过后 yuanzheng settle 结算远征声望。\n");
	return 1;
}
