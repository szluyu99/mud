// 江湖远征：zjrogue 单人局内成长模式。
#include <ansi.h>

#define YZ_D "/adm/daemons/yuanzhengd"

int menu(object me)
{
	mapping s;
	string str;

	YZ_D->ensure_world(me);
	s = YZ_D->state(me);
	str = ZJOBLONG "江湖远征\n" + YZ_D->status(me) + "\n" + YZ_D->overview(me) + "\n";
	if (! s)
		str += "先选一个流派：剑客走剑法连招，拳师空手贴身短打，刀客血厚刚猛。\n"
		     + "五关：剿匪、夺宝、寻访、截杀、终局。三条命，通关后结算远征声望。\n";
	else
		str += "提示：跟着「目标」做，打完点下面的按钮选天赋。\n";
	str += ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	if (! s)
	{
		str += "剑客:yuanzheng start sword" ZJSEP;
		str += "拳师:yuanzheng start fist" ZJSEP;
		str += "刀客:yuanzheng start blade" ZJSEP;
	}
	else
	{
		if (s["planning"])
			str += "看悬赏榜:yuanzheng brief" ZJSEP;
		else
			str += "继续远征:yuanzheng resume" ZJSEP;
		str += "看当前目标:yuanzheng status" ZJSEP;
		str += "局内摊位（" + (s["coin"] || 0) + " 钱）:yuanzheng stall" ZJSEP;
		if (s["points"] > 0)
			str += "选天赋:yuanzheng talents" ZJSEP;
		if (s["stage"] < 5)
			str += "上交宝物:yuanzheng submit" ZJSEP;
		else
			str += "结算远征:yuanzheng settle" ZJSEP;
		str += "放弃远征:yuanzheng abandon" ZJSEP;
	}
	str += "远征商店:yuanzheng shop" ZJSEP;
	write(str + "\n");
	return 1;
}

int main(object me, string arg)
{
	string sub, cty;
	int n;

	if (! userp(me)) return 0;
	if (! arg || arg == "") return menu(me);
	if (sscanf(arg, "start %s %s", sub, cty) == 2) return YZ_D->start(me, sub, cty);
	if (sscanf(arg, "start %s", sub) == 1) return YZ_D->start(me, sub);
	if (sscanf(arg, "buy %d", n) == 1) return YZ_D->buy(me, n);
	if (sscanf(arg, "debugsp %d", n) == 1) return YZ_D->debug_sp(me, n);
	if (sscanf(arg, "choose %d", n) == 1) return YZ_D->choose(me, n);
	if (sscanf(arg, "event %d", n) == 1) return YZ_D->resolve_event(me, n);
	if (sscanf(arg, "plan %d", n) == 1) return YZ_D->plan(me, n);
	if (sscanf(arg, "stall %d", n) == 1) return YZ_D->buy_stall(me, n);
	if (sscanf(arg, "%s %d", sub, n) == 2 && sub == "choose") return YZ_D->choose(me, n);

	switch (arg)
	{
	case "start":	return YZ_D->start(me, "", "");
	case "status":	write(YZ_D->status(me) + "\n"); return 1;
	case "talents":	YZ_D->talent_menu(me); return 1;
	case "submit":	return YZ_D->submit(me);
	case "settle":	return YZ_D->settle(me);
	case "abandon":	return YZ_D->abandon(me);
	case "debugwin":	return YZ_D->debug_win(me);
	case "resume":	return YZ_D->resume(me);
	case "brief":	return YZ_D->brief_menu(me), 1;
	case "event":	return notify_fail("请选择 1 或 2：yuanzheng event 1\n");
	case "plan":	return notify_fail("请选择 1、2 或 3：yuanzheng plan 1\n");
	case "stall":	return YZ_D->stall(me);
	case "where":	return YZ_D->where(me);
	case "shop":	return YZ_D->shop(me), 1;
	case "debugsp":	return YZ_D->debug_sp(me, 0);
	}
	return notify_fail("用法：yuanzheng（菜单）、start sword|fist|blade、plan 1-3、status、event 1|2、choose 1-3、submit、settle、abandon、shop、buy 1-4。\n");
}

int help(object me)
{
	write("远征：开局先选流派（剑客/拳师/刀客），五关依次是剿匪、夺宝、寻访、截杀、终局。\n"
	      "每过一关得到 1 点属性点并三选一天赋（天赋按流派给）；三条命，倒下回客店；\n"
	      "每局的城是随机挑的（扬州、苏州、杭州、泉州），五关都在那一带；\n"
	      "开局先看悬赏榜，挑一条路（yuanzheng plan 1|2|3）决定先做哪一桩；\n"
	      "五关全过后 yuanzheng settle 结算远征声望，声望可以在 yuanzheng shop 里换常驻特权。\n");
	return 1;
}
