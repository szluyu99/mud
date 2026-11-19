// autotraind.c
// 自动修炼：替玩家按正常玩法提升武功，单机版附加功能。
// 每秒一次 tick，每次只做一个动作（向师父请教、练习一轮、打坐、吐纳……）。
//
// 方式：
//   learn  向师父请教（消耗潜能和精神，要在师父身边，路远会自己走回去）
//   lian   练习已激发的特殊技能（消耗气血和内力，基本功夫要比特殊功夫高）
//   dazuo  打坐提升内力上限
//
// 自己不会无限跑：每个目标学不动 / 练不动就跳到下一个，全部完成或卡住就停下，
// 停下时报告每个技能从多少级到多少级、用了多少潜能。

#include <ansi.h>

#define TICK		1
#define AQ_D		"/adm/daemons/autoquestd"
#define LEARN_TIMES	20	// 每次向师父请教的句数
#define LIAN_TIMES	20	// 每次练习的趟数

void tick(object me, int gen);
void stop(object me, string reason);

void note(object me, mapping s, string msg)
{
	if (s["msg"] == msg) return;
	s["msg"] = msg;
	tell_object(me, HIC "【自动修炼】" NOR + msg + "\n");
}

mapping query_state(object me) { return me->query_temp("autotrain"); }

int pot_left(object me)
{
	return me->query("potential") - me->query("learned_points");
}

// 师父对象（在当前房间里）
object master_here(object me)
{
	string mid = me->query("family/master_id");
	object ob;
	if (! stringp(mid)) return 0;
	ob = present(mid, environment(me));
	if (ob && living(ob) && ob->is_character() && ! userp(ob)) return ob;
	return 0;
}

// 师父平时待的房间：上次在哪里见过师父就去哪里；没见过时用自动师门登记的掌门房间
// （只在掌门就是自己师父时才用，否则宁可让玩家自己走过去）
string master_room(object me)
{
	string fam, r;
	mapping m;
	if (stringp(r = me->query("autotrain/master_room"))) return r;
	fam = me->query("family/family_name");
	m = AQ_D->query_masters();
	if (mapp(m) && arrayp(m[fam]))
	{
		object mob = find_object(m[fam][0]);
		string mid;
		if (! mob) catch(mob = load_object(m[fam][0]));
		mid = mob ? mob->query("id") : 0;
		if (mid && mid == me->query("family/master_id")) return m[fam][1];
	}
	return 0;
}

// 在师父身边时记下这个房间，下次自己找回来
void remember_master(object me)
{
	if (master_here(me)) me->set("autotrain/master_room", base_name(environment(me)));
}

// 武功类技能受实战经验限制：等级³/10 不能超过经验（和 F_SKILL::can_improve_skill 一致）
int exp_capped(object me, string sk)
{
	int lv;
	string t;
	catch(t = SKILL_D(sk)->type());
	if (t != "martial" && t != "poison") return 0;
	lv = me->query_skill(sk, 1);
	return lv * lv * lv / 10 > me->query("combat_exp");
}

// 基本功夫（force、unarmed、dodge…）排在特殊功夫前面：特殊功夫往往要求基本功夫先到
int is_basic(string sk)
{
	return member_array(sk, ({ "force", "unarmed", "cuff", "strike", "finger", "hand", "claw",
		"dodge", "parry", "sword", "blade", "staff", "stick", "whip", "club", "hammer", "axe",
		"throwing", "literate", "medical", "array" })) >= 0;
}

int by_basic(string a, string b)
{
	int x = is_basic(a), y = is_basic(b);
	if (x != y) return y - x;
	return strcmp(a, b);
}

// 师父会、而且比自己高的技能，可以向师父请教
string *learnable(object me, object master)
{
	mapping ms;
	string *out = ({ });
	if (! master || ! mapp(ms = master->query_skills())) return out;
	foreach (string sk, int lv in ms)
	{
		if (me->query_skill(sk, 1) >= lv) continue;
		if (master->query("no_teach/" + sk)) continue;
		out += ({ sk });
	}
	return sort_array(out, (: by_basic :));
}

// 已经激发、可以拿来练习的基本功夫（基本功夫比特殊功夫高才有进步）
string *practicable(object me)
{
	mapping map = me->query_skill_map();
	string *out = ({ });
	if (! mapp(map)) return out;
	foreach (string base, string sp in map)
	{
		if (! stringp(sp) || base == "force") continue;	// 内功只能学，不能练
		if (me->query_skill(sp, 1) < 1) continue;
		if (me->query_skill(base, 1) <= me->query_skill(sp, 1)) continue;
		out += ({ base });
	}
	return sort_array(out, (: by_basic :));
}

void stop(object me, string reason)
{
	mapping s;
	string msg = "";
	if (! objectp(me)) return;
	s = me->query_temp("autotrain");
	me->delete_temp("autotrain");
	me->delete_temp("pending/auto_lian");
	me->delete_temp("pending/auto_learn");
	me->delete_temp("pending/auto_dazuo");
	if (! reason) return;
	if (mapp(s) && mapp(s["from"]))
	{
		foreach (string sk, int lv in s["from"])
		{
			int now = me->query_skill(sk, 1);
			if (now != lv) msg += "  " + to_chinese(sk) + "：" + lv + " → " + now + "\n";
		}
		if (s["neili0"] != me->query("max_neili"))
			msg += "  内力上限：" + s["neili0"] + " → " + me->query("max_neili") + "\n";
		if (s["pot0"] > pot_left(me))
			msg += "  用掉潜能：" + (s["pot0"] - pot_left(me)) + "\n";
		msg += "  用时：" + (time() - s["t0"]) / 60 + " 分 " + (time() - s["t0"]) % 60 + " 秒\n";
	}
	tell_object(me, HIY "【自动修炼】已停止：" NOR + reason + "\n" + (msg != "" ? "本次进展：\n" + msg : ""));
}

// mode: "learn" / "lian" / "dazuo"；targets: 技能列表（dazuo 时忽略）
int start(object me, string mode, string *targets)
{
	mapping s = me->query_temp("autotrain");
	mapping from = ([ ]);
	if (mapp(s) && s["on"]) return 0;
	if (mapp(AQ_D->query_state(me)) && AQ_D->query_state(me)["on"])
		AQ_D->stop(me, "开始自动修炼，自动师门先停下。");
	foreach (string sk in targets)
	{
		from[sk] = me->query_skill(sk, 1);
		if (mode == "lian")
		{
			string sp = me->query_skill_mapped(sk);
			if (stringp(sp)) from[sp] = me->query_skill(sp, 1);
		}
	}
	s = ([ "on" : 1, "gen" : time() + random(100000), "mode" : mode, "targets" : targets,
		"idx" : 0, "from" : from, "t0" : time(), "pot0" : pot_left(me),
		"neili0" : me->query("max_neili"), "fail" : 0, "walk" : ([ "block" : ([ ]), "stuck" : 0 ]),
		"wait" : 0, "last" : -1, "lv" : ([ ]), "miss" : ([ ]) ]);
	me->set_temp("autotrain", s);
	remember_master(me);
	tell_object(me, HIC "【自动修炼】开始。再点一次「自动修炼」可以停止。\n" NOR);
	call_out("tick", TICK, me, s["gen"]);
	return 1;
}

// 吃喝；气血、精神不够时运功恢复。返回 1 表示这一秒在做保养
int upkeep(object me, mapping s)
{
	if (me->query("food") < me->max_food_capacity() / 4 ||
	    me->query("water") < me->max_water_capacity() / 4)
	{
		me->set("food", me->max_food_capacity());
		me->set("water", me->max_water_capacity());
		tell_object(me, HIC "【自动修炼】" NOR "你觉得饿了，系统送来牛奶和面包，你吃饱喝足。\n");
	}
	return 0;
}

// 当前目标到头了：从列表里拿掉，轮到下一个
void next_target(object me, mapping s, string why)
{
	string *t = s["targets"];
	if (why) tell_object(me, HIC "【自动修炼】" NOR + why + "\n");
	if (s["idx"] < sizeof(t)) t = t[0..s["idx"] - 1] + t[s["idx"] + 1..];
	s["targets"] = t;
	if (s["idx"] >= sizeof(t)) s["idx"] = 0;
	s["fail"] = 0;
	s["last"] = -1;
	s["msg"] = 0;
	if (! sizeof(t))
		stop(me, "列出的技能都练到头了。" + (s["capped"] ? "有些是因为实战经验不够，去做做师门任务或打打怪再来。" : ""));
}

// 这一轮练完了，换下一个技能（几个技能轮流提升，而不是一个练到顶才换）
void rotate(mapping s)
{
	int n = sizeof(s["targets"]);
	if (n > 1) { s["idx"] = (s["idx"] + 1) % n; s["last"] = -1; s["fail"] = 0; }
}

// 精神不够：运功回精神，回不了就等（精神会慢慢自己回来）
int recover_jing(object me, mapping s, int need)
{
	if (me->query("jing") >= need) return 0;
	if (me->query("neili") > 20 && me->query("jing") < me->query("eff_jing"))
		me->force_me("exert regenerate");
	note(me, s, "精神不足，休息一下……");
	return 1;
}

// 气血不够：运功回气血，回不了就等
int recover_qi(object me, mapping s, int need)
{
	if (me->query("qi") >= need) return 0;
	if (me->query("neili") > 20 && me->query("qi") < me->query("eff_qi"))
		me->force_me("exert recover");
	note(me, s, "气血不足，休息一下……");
	return 1;
}

void do_learn(object me, mapping s)
{
	string sk = s["targets"][s["idx"]];
	object master;
	string room;
	int r, lv, need;

	if (pot_left(me) < 1) { stop(me, "潜能用完了。"); return; }

	if (! objectp(master = master_here(me)))
	{
		room = master_room(me);
		if (! room) { stop(me, "不知道师父在哪里，请先走到师父身边再开始。"); return; }
		r = AQ_D->walk_to(me, s["walk"], room);
		if (r < 0) { stop(me, "找不到去师父那里的路。"); return; }
		if (r == 0) { note(me, s, "回师父那里请教。"); return; }
		if (! objectp(master = master_here(me))) { note(me, s, "师父不在，等一会儿。"); return; }
	}

	remember_master(me);
	lv = me->query_skill(sk, 1);
	if (master->query_skill(sk, 1) <= lv)
	{
		next_target(me, s, to_chinese(sk) + "已经不输师父了，换下一个。");
		return;
	}
	if (exp_capped(me, sk))
	{
		s["capped"] = 1;
		next_target(me, s, to_chinese(sk) + "到 " + lv + " 级了，实战经验不够，再学也领会不了，换下一个。");
		return;
	}
	need = (100 + lv * 2) / (me->query("int") > 0 ? me->query("int") : 20) + 1;
	if (recover_jing(me, s, need * 2)) return;

	if (s["lv"][sk] == lv + 1 && ++s["miss"][sk] > 3)
	{
		// 连续几轮都没有进步：门派限制、需要先学别的功夫等，学不动了
		next_target(me, s, to_chinese(sk) + "学不动了，换下一个。");
		return;
	}
	if (s["lv"][sk] != lv + 1) s["miss"][sk] = 0;
	s["lv"][sk] = lv + 1;
	note(me, s, "向" + master->name() + "请教" + to_chinese(sk) + "（" + lv + "级，剩余潜能 " + pot_left(me) + "）。");
	me->force_me("learn " + master->query("id") + " " + sk + " " +
		(pot_left(me) < LEARN_TIMES ? pot_left(me) : LEARN_TIMES));
	me->delete_temp("pending/auto_learn");	// 由我们自己控制节奏，不用指令自带的托管
	rotate(s);
}

void do_lian(object me, mapping s)
{
	string base = s["targets"][s["idx"]];
	string sp = me->query_skill_mapped(base);
	int lv;

	if (! stringp(sp)) { next_target(me, s, to_chinese(base) + "没有激发特殊功夫，跳过。"); return; }
	lv = me->query_skill(sp, 1);
	if (me->query_skill(base, 1) <= lv)
	{
		next_target(me, s, to_chinese(sp) + "已经赶上" + to_chinese(base) + "，要先提高基本功夫，换下一个。");
		return;
	}
	if (exp_capped(me, sp))
	{
		s["capped"] = 1;
		next_target(me, s, to_chinese(sp) + "到 " + lv + " 级了，实战经验不够，再练也没有进步，换下一个。");
		return;
	}
	if (environment(me)->query("no_learn") || environment(me)->query("no_fight"))
	{
		stop(me, "这里不能练功，换个地方再开始。");
		return;
	}
	if (recover_qi(me, s, me->query("eff_qi") * 2 / 3)) return;
	if (me->query("neili") < 20)
	{
		if (me->query_skill("force", 1) >= 10 && me->query_skill_mapped("force") && me->query("qi") > 40)
		{
			note(me, s, "内力不够，先打坐。");
			me->force_me("dazuo");
			me->delete_temp("pending/auto_dazuo");
			return;
		}
		stop(me, "内力不够，又不会打坐（基本内功要先学到 10 级并激发内功）。");
		return;
	}
	if (s["lv"][base] == lv + 1 && ++s["miss"][base] > 4)
	{
		next_target(me, s, to_chinese(sp) + "练不动了，换下一个。");
		return;
	}
	if (s["lv"][base] != lv + 1) s["miss"][base] = 0;
	s["lv"][base] = lv + 1;
	note(me, s, "练习" + to_chinese(sp) + "（" + lv + "级）。");
	me->force_me("lian " + base + " " + LIAN_TIMES);
	me->delete_temp("pending/auto_lian");
	rotate(s);
}

void do_dazuo(object me, mapping s)
{
	int mx = me->query("max_neili");
	if (me->query_skill("force", 1) < 10 || ! me->query_skill_mapped("force"))
	{
		stop(me, "要先把基本内功学到 10 级，并激发一门内功（enable force ...）才能打坐。");
		return;
	}
	if (mx >= me->query_neili_limit())
	{
		stop(me, "内力上限已经到顶了，要提高内功等级才能继续。");
		return;
	}
	if (environment(me)->query("no_dazuo") || environment(me)->query("no_fight"))
	{
		stop(me, "这里不能打坐，换个地方再开始。");
		return;
	}
	if (recover_jing(me, s, me->query("max_jing") * 2 / 3)) return;
	if (recover_qi(me, s, me->query("eff_qi") * 2 / 3)) return;
	note(me, s, "打坐修炼内力（上限 " + mx + " / " + me->query_neili_limit() + "）。");
	me->force_me("dazuo");
	me->delete_temp("pending/auto_dazuo");
}

void tick(object me, int gen)
{
	mapping s;
	object env;

	if (! objectp(me)) return;
	s = me->query_temp("autotrain");
	if (! mapp(s) || ! s["on"] || s["gen"] != gen) return;
	call_out("tick", TICK, me, gen);

	if (! interactive(me) && ! me->query_temp("netdead_ok")) { stop(me, "你已经离线。"); return; }
	if (me->is_ghost()) { stop(me, "你死了。"); return; }
	if (! living(me)) return;
	if (! objectp(env = environment(me))) return;
	if (me->is_fighting()) { stop(me, "有人跟你动手了。"); return; }
	if (me->is_busy() || me->query_temp("pending/exercise") || me->query_temp("pending/respirate")) return;
	if (me->query_temp("is_flying")) return;

	if (upkeep(me, s)) return;

	switch (s["mode"])
	{
	case "learn": do_learn(me, s); break;
	case "lian":  do_lian(me, s); break;
	case "dazuo": do_dazuo(me, s); break;
	default: stop(me, "不认识的修炼方式。");
	}
}
