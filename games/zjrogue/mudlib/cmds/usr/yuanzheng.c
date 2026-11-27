// 江湖远征：zjrogue 单人局内成长模式。
#include <ansi.h>

#define YZ_D "/adm/daemons/yuanzhengd"

int menu(object me)
{
	mapping s;
	string str, goal;

	YZ_D->ensure_world(me);
	s = YZ_D->state(me);
	str = ZJOBLONG "江湖远征\n" + YZ_D->status(me) + "\n" + YZ_D->overview(me) + "\n";
	if (! s)
		str += "先选一个流派：剑客走剑法连招，拳师空手贴身短打，刀客血厚刚猛。\n"
		     + "五关：剿匪、夺宝、寻访、截杀、终局。" + chinese_number(3 + YZ_D->perks_of(me, "life")) + "条命，通关后结算远征声望。\n";
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
		else if (mapp(s["event"]))
			// 遭遇的弹窗被关掉了也得能找回来，不然下一关一直不开
			str += "路上遇到的事（先处理）:yuanzheng event" ZJSEP;
		else
			str += "继续远征:yuanzheng resume" ZJSEP;
		if (stringp(goal = YZ_D->goal_room(me)) && (! environment(me) || base_name(environment(me)) != goal))
			str += "带我去目标:去 " + goal + ZJSEP;
		str += "看当前目标:yuanzheng status" ZJSEP;
		str += "局内摊位（" + (s["coin"] || 0) + " 钱）:yuanzheng stall" ZJSEP;
		if (s["points"] > 0)
			str += "选天赋:yuanzheng talents" ZJSEP;
		// 只在手上真有宝物时给「上交」，别的关卡点了只会得到一句「现在不需要」
		if (s["stage"] >= 5)
			str += "结算远征:yuanzheng settle" ZJSEP;
		else if (present("treasure", me) && environment(me) &&
			 base_name(environment(me)) == YZ_D->inn_room(me))
			str += "上交宝物:yuanzheng submit" ZJSEP;
		str += "放弃远征:yuanzheng abandon" ZJSEP;
	}
	str += "远征商店:yuanzheng shop" ZJSEP;
	if (s)
		str += "离开江湖（局里的目标先收起来）:yuanzheng pause" ZJSEP;
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
	if (sscanf(arg, "life %d", n) == 1) return YZ_D->debug_life(me, n);
	if (sscanf(arg, "jump %d", n) == 1) return YZ_D->jump(me, n);
	if (sscanf(arg, "stall %d", n) == 1) return YZ_D->buy_stall(me, n);
	if (sscanf(arg, "tier %d", n) == 1) return YZ_D->set_tier(me, n);
	if (sscanf(arg, "debugtier %d", n) == 1) return YZ_D->debug_tier(me, n);
	if (sscanf(arg, "debugevent %d", n) == 1) return YZ_D->debug_event(me, n);
	if (sscanf(arg, "debugboss %d", n) == 1) return YZ_D->debug_boss(me, n);
	if (arg == "debugrare") return YZ_D->debug_rare(me);
	if (sscanf(arg, "debugrare %s", sub) == 1) return YZ_D->debug_rare(me, sub);
	if (sscanf(arg, "%s %d", sub, n) == 2 && sub == "choose") return YZ_D->choose(me, n);

	switch (arg)
	{
	case "start":	return YZ_D->start(me, "", "");
	case "status":	write(YZ_D->status(me) + "\n" + (YZ_D->state(me) ? "" : YZ_D->overview(me) + "\n")); return 1;
	case "talents":	YZ_D->talent_menu(me); return 1;
	case "submit":	return YZ_D->submit(me);
	case "settle":	return YZ_D->settle(me);
	// 手机上误点一下就丢一整局：先确认
	case "abandon":
		if (! YZ_D->state(me)) return notify_fail("你还没有开始远征。\n");
		tell_object(me, ZJOBLONG "真的放弃这一局？局内天赋、钱和借来的兵器都会收回，这一局不算声望。\n"
			ZJOBACTS2 + ZJMENUF(2, 2, 8, 30) +
			"确定放弃:yuanzheng abandon yes" ZJSEP "接着打:yuanzheng resume\n");
		return 1;
	case "abandon yes":	return YZ_D->abandon(me);
	case "debugwin":	return YZ_D->debug_win(me);
	case "resume":	return YZ_D->resume(me);
	case "brief":	return YZ_D->brief_menu(me), 1;
	case "pause":	return YZ_D->pause(me);
	case "event":	return YZ_D->show_event(me);
	case "life":	return YZ_D->debug_life(me, 1);
	case "jump":	return notify_fail("用法：yuanzheng jump 1-" + "5。\n");
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
	      "每过一关得到 1 点属性点并三选一天赋（天赋按流派给）；三条命（商店「命硬」能加），倒下回本城落脚处，这一关重来；\n"
	      "命用完这局就结束，按过了几关带回少量声望；\n"
	      "每局的城是随机挑的（扬州、苏州、杭州、泉州），五关都在那一带；\n"
	      "开局先看悬赏榜，挑一条路（yuanzheng plan 1|2|3）决定先做哪一桩；\n"
	      "五关全过后 yuanzheng settle 结算远征声望，声望可以在 yuanzheng shop 里换常驻特权。\n"
	      "远征途中可以照常做别的事（yuanzheng pause 把局里的目标先收起来）；\n"
	      "身上带着局内的加成和借来的兵器，status 里列得出来，结算时一块收回。\n");
	return 1;
}
