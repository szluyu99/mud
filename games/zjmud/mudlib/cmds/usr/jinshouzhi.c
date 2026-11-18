// jinshouzhi.c  金手指（单机版专用）
// 浏览器单机版没有充值和其他玩家，给自己加点资源省去巫师指令。
#include <ansi.h>

inherit F_CLEAN_UP;

#define CMD "jinshouzhi"

string *items = ({
	"元宝+1000",     "yuanbao 1000",
	"元宝+10000",    "yuanbao 10000",
	"黄金+100",      "gold 100",
	"黄金+1000",     "gold 1000",
	"经验+1万",      "exp 10000",
	"经验+10万",     "exp 100000",
	"潜能+1万",      "pot 10000",
	"阅历+1000",     "score 1000",
	"威望+100",      "weiwang 100",
	"贡献+1000",     "gongxian 1000",
	"内力上限+500",  "neili 500",
	"精力上限+500",  "jingli 500",
	"技能+10级",     "skill 10",
	"状态回满",      "full 0",
});

int show_menu(object me)
{
	string str;
	int i;

	str = ZJOBLONG "金手指（单机版专用）\n"
		"元宝：" + me->query("yuanbao") + "  经验：" + me->query("combat_exp") +
		"  潜能：" + (me->query("potential") - me->query("learned_points")) + "\n"
		ZJOBACTS2 + ZJMENUF(3, 3, 8, 30);
	for (i = 0; i < sizeof(items); i += 2)
		str += items[i] + ":" CMD " " + items[i + 1] + ZJSEP;
	write(str + "\n");
	return 1;
}

int main(object me, string arg)
{
	string what, sk, *sks;
	int n, i;
	mapping skills;

	if (! userp(me))
		return 0;
	if (! me->query("born"))
		return notify_fail("你还没有出生，先去投胎吧。\n");

	if (! arg || sscanf(arg, "%s %d", what, n) != 2)
		return show_menu(me);

	switch (what)
	{
	case "yuanbao":
		me->add("yuanbao", n);
		write("你获得了" + n + "元宝。\n");
		break;
	case "gold":
		MONEY_D->pay_player(me, n * 10000);
		write("你获得了" + n + "两黄金（多的会折成银票）。\n");
		break;
	case "exp":
		me->add("combat_exp", n);
		write("你的经验增加了" + n + "点。\n");
		break;
	case "pot":
		me->add("potential", n);
		write("你的潜能增加了" + n + "点。\n");
		break;
	case "score":
		me->add("score", n);
		write("你的江湖阅历增加了" + n + "点。\n");
		break;
	case "weiwang":
		me->add("weiwang", n);
		write("你的江湖威望增加了" + n + "点。\n");
		break;
	case "gongxian":
		me->add("gongxian", n);
		write("你的门派贡献增加了" + n + "点。\n");
		break;
	case "neili":
		me->add("max_neili", n);
		me->set("neili", me->query("max_neili"));
		write("你的内力上限增加了" + n + "点。\n");
		break;
	case "jingli":
		me->add("max_jingli", n);
		me->set("jingli", me->query("max_jingli"));
		write("你的精力上限增加了" + n + "点。\n");
		break;
	case "skill":
		skills = me->query_skills();
		if (! mapp(skills) || ! sizeof(skills))
			return notify_fail("你还没有学会任何技能，先去拜师学一点吧。\n");
		sks = keys(skills);
		for (i = 0; i < sizeof(sks); i++)
			me->set_skill(sks[i], skills[sks[i]] + n);
		write("你所有的技能都提高了" + n + "级。\n");
		break;
	case "full":
		me->set("eff_qi", me->query("max_qi"));
		me->set("qi", me->query("max_qi"));
		me->set("eff_jing", me->query("max_jing"));
		me->set("jing", me->query("max_jing"));
		me->set("neili", me->query("max_neili"));
		me->set("jingli", me->query("max_jingli"));
		me->set("food", me->max_food_capacity());
		me->set("water", me->max_water_capacity());
		me->clear_condition(0);
		write("你的气血、精神、内力、精力和饮食都恢复满了。\n");
		break;
	default:
		return show_menu(me);
	}
	return show_menu(me);
}

int help(object me)
{
	write(@HELP
指令格式 : jinshouzhi

单机版专用的金手指菜单，可以直接增加元宝、黄金、经验、潜能、
阅历、威望、门派贡献、内力和精力上限，把已学技能各提高十级，
或者把状态回满。也可以在「系统」菜单里点「金手指」打开。
HELP);
	return 1;
}
