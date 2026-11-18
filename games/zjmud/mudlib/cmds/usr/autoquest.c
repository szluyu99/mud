// autoquest.c 自动师门（单机版附加功能）

#include <ansi.h>

inherit F_CLEAN_UP;

#define AQ_D "/adm/daemons/autoquestd"

int help(object me);

int main(object me, string arg)
{
	mapping s, q;
	string msg;

	if (! userp(me)) return 0;
	if (! me->query("born"))
		return notify_fail("你还没有出生，先去投胎吧。\n");

	s = AQ_D->query_state(me);

	if (arg == "stop" || (! arg && mapp(s) && s["on"]))
	{
		if (! mapp(s) || ! s["on"])
			return notify_fail("自动师门没有在运行。\n");
		AQ_D->stop(me, "你让它停下了。");
		return 1;
	}

	if (arg == "status")
	{
		q = me->query("quest");
		msg = ZJOBLONG "自动师门：" + ((mapp(s) && s["on"]) ? HIG "运行中" NOR : "未运行") + ZJBR;
		if (mapp(s))
			msg += sprintf("本次完成：送信 %d 次、追杀 %d 次" ZJBR, s["letter"], s["kill"]);
		if (mapp(q))
			msg += "当前任务：" + (q["type"] == "letter" ? "送信给" : "追杀") +
				(q["name"] ? q["name"] : "?") + ZJBR;
		else
			msg += "当前没有任务。" ZJBR;
		if (mapp(s) && s["msg"]) msg += "最近动作：" + s["msg"] + ZJBR;
		write(msg + "\n");
		return 1;
	}

	if (arg && arg != "start")
		return help(me);

	if (! stringp(me->query("family/family_name")))
		return notify_fail("你还没有拜师，先拜入一个门派再来做师门任务吧。\n");

	AQ_D->start(me);
	return 1;
}

int help(object me)
{
	write(@HELP
指令格式：autoquest [start|stop|status]

自动师门（单机版附加功能）。替你按正常玩法做师门任务：
回师父那里领任务，走路或飞行到目标附近；
送信任务把信交给收信人，再带回执给师父；
追杀任务拿出弓箭（有盘龙弓时）射杀目标，没箭就去扬州打铁铺买，
买不到就用普通招式打。气血低时运功或撤退休息，饿了自动吃喝。

经验在三万到五万之间师父不派任务，自动师门会停下。
五万经验以上会先向师父请求出去历练。
直接输入 autoquest 可以开始或停止。
HELP);
	return 1;
}
