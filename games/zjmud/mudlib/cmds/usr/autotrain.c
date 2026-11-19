// autotrain.c 自动修炼（单机版附加功能）

#include <ansi.h>

inherit F_CLEAN_UP;

#define AT_D "/adm/daemons/autotraind"
#define CMD  "autotrain"

int help(object me);

int pot_left(object me) { return me->query("potential") - me->query("learned_points"); }

// 第一层：选方式
int show_modes(object me)
{
	string str = ZJOBLONG "自动修炼（单机版附加功能）" ZJBR
		"按正常玩法替你练功：缺精神、气血会运功或休息，饿了自动吃喝，"
		"学不动、练不动会自动换下一个，全部完成就停下并报告进展。" ZJBR
		"剩余潜能：" + pot_left(me) + "    内力：" + me->query("neili") + " / " + me->query("max_neili") +
		"（上限 " + me->query_neili_limit() + "）\n"
		ZJOBACTS2 + ZJMENUF(1, 1, 8, 30);
	str += "向师父请教（消耗潜能）:" CMD " pick learn" ZJSEP;
	str += "练习已激发的功夫（消耗气血内力）:" CMD " pick lian" ZJSEP;
	str += "打坐提升内力上限:" CMD " go dazuo" ZJSEP;
	write(str + "\n");
	return 1;
}

// 第二层：选技能（可以全部，也可以单个）
int show_skills(object me, string mode)
{
	string *list, str;
	object master;

	if (mode == "learn")
	{
		master = AT_D->master_here(me);
		if (! master)
		{
			list = 0;
			if (! stringp(AT_D->master_room(me)))
				return notify_fail("要先走到师父身边，自动修炼才知道该向谁请教（之后会自己找回来）。\n");
			return notify_fail("你不在师父身边。自动修炼会自己走回去，但要先在师父身边选好技能：请先去找师父。\n");
		}
		list = AT_D->learnable(me, master);
		if (! sizeof(list)) return notify_fail(master->name() + "已经没有能教你的了。\n");
	} else
	{
		list = AT_D->practicable(me);
		if (! sizeof(list))
			return notify_fail("没有可以练习的功夫：要先用 enable 激发特殊功夫，并且基本功夫的等级比特殊功夫高。\n");
	}

	str = ZJOBLONG + (mode == "learn" ? "向" + master->name() + "请教哪些技能？" : "练习哪些功夫？") + ZJBR
		"选「全部」会从上到下依次进行，一个到头了就换下一个。\n"
		ZJOBACTS2 + ZJMENUF(2, 2, 8, 30);
	str += HIG "全部" NOR ":" CMD " go " + mode + " all" ZJSEP;
	foreach (string sk in list)
	{
		string label;
		if (mode == "learn")
			label = to_chinese(sk) + " " + me->query_skill(sk, 1) + "/" + master->query_skill(sk, 1);
		else
		{
			string sp = me->query_skill_mapped(sk);
			label = to_chinese(sp) + " " + me->query_skill(sp, 1) + "/" + me->query_skill(sk, 1);
		}
		str += label + ":" CMD " go " + mode + " " + sk + ZJSEP;
	}
	write(str + "\n");
	return 1;
}

int main(object me, string arg)
{
	mapping s;
	string mode, what, *targets;

	if (! userp(me)) return 0;
	if (! me->query("born"))
		return notify_fail("你还没有出生，先去投胎吧。\n");

	s = AT_D->query_state(me);

	if (arg == "stop" || (! arg && mapp(s) && s["on"]))
	{
		if (! mapp(s) || ! s["on"])
			return notify_fail("自动修炼没有在运行。\n");
		AT_D->stop(me, "你让它停下了。");
		return 1;
	}

	if (arg == "status")
	{
		string msg = ZJOBLONG "自动修炼：" + ((mapp(s) && s["on"]) ? HIG "运行中" NOR : "未运行") + ZJBR;
		if (mapp(s) && s["on"])
		{
			msg += "方式：" + ([ "learn" : "向师父请教", "lian" : "练习", "dazuo" : "打坐" ])[s["mode"]] + ZJBR;
			if (s["mode"] != "dazuo" && s["idx"] < sizeof(s["targets"]))
				msg += sprintf("进度：第 %d / %d 个（%s）", s["idx"] + 1, sizeof(s["targets"]),
					to_chinese(s["targets"][s["idx"]])) + ZJBR;
			if (s["msg"]) msg += "最近动作：" + s["msg"] + ZJBR;
		}
		msg += "剩余潜能：" + pot_left(me);
		write(msg + "\n");
		return 1;
	}

	if (! arg) return show_modes(me);

	if (sscanf(arg, "pick %s", mode) == 1)
	{
		if (mode != "learn" && mode != "lian") return help(me);
		return show_skills(me, mode);
	}

	if (arg == "go dazuo")
	{
		AT_D->start(me, "dazuo", ({ }));
		return 1;
	}

	if (sscanf(arg, "go %s %s", mode, what) != 2 || (mode != "learn" && mode != "lian"))
		return help(me);

	if (mode == "learn")
	{
		object master = AT_D->master_here(me);
		if (! master) return notify_fail("要在师父身边开始（之后它会自己找回师父那里）。\n");
		targets = AT_D->learnable(me, master);
	} else
		targets = AT_D->practicable(me);

	if (what != "all")
	{
		if (member_array(what, targets) < 0)
			return notify_fail(mode == "learn" ? "师父教不了你这个，或者你已经不输师父了。\n"
				: "这门功夫现在练不了（没有激发，或者基本功夫不够高）。\n");
		targets = ({ what });
	}
	if (! sizeof(targets)) return notify_fail("没有可以修炼的技能。\n");
	if (mode == "learn" && pot_left(me) < 1) return notify_fail("你没有潜能了，先去做任务或者用金手指加点潜能吧。\n");

	AT_D->start(me, mode, targets);
	return 1;
}

int help(object me)
{
	write(@HELP
指令格式：autotrain [stop|status]

自动修炼（单机版附加功能）。按正常玩法替你提升武功：
  向师父请教：消耗潜能和精神，不在师父身边会自己走回去；
  练习：练已经激发的特殊功夫，消耗气血和内力，内力不够会先打坐；
  打坐：提升内力上限，直到当前内功等级允许的上限。
精神、气血不足会运功恢复或等一会儿，饿了自动吃喝。
一个技能学不动（不输师父、缺乏实战经验）或练不动（基本功夫不够高）
就换下一个，全部完成、潜能用完或有人动手时停下，并报告本次进展。

直接输入 autotrain 打开菜单；运行中再输入一次就停止。
HELP);
	return 1;
}
