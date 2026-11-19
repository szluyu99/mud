// autoquestd.c
// 自动师门：替玩家按正常玩法做师门任务（送信 / 追杀），单机版附加功能。
// 每秒一次 tick，每次只做一个动作（走一步、给东西、出招等）。

#include <ansi.h>

#define TICK		1
#define BFS_LIMIT	3000
#define FLY_BFS_LIMIT	2500
#define ROOM_KONGZHONG	"/d/city/kongzhong"
#define SMITH_ROOM	"/d/city/datiepu"
#define RECEIVER	"/kungfu/class/generate/receiver"
#define KILLED		"/kungfu/class/generate/killed"

// 门派 -> ({ 下任务的师父文件, 师父所在房间 })
mapping masters = ([
	"丐帮"     : ({ "/kungfu/class/gaibang/hong", "/d/city/gbxiaowu" }),
	"全真教"   : ({ "/kungfu/class/quanzhen/ma", "/d/quanzhen/shiweishi" }),
	"峨嵋派"   : ({ "/kungfu/class/emei/miejue", "/d/emei/hcahoudian" }),
	"古墓派"   : ({ "/kungfu/class/gumu/longnv", "/d/gumu/zhengting" }),
	"华山派"   : ({ "/kungfu/class/huashan/yue-buqun", "/d/huashan/qunxianguan" }),
	"灵鹫宫"   : ({ "/kungfu/class/lingjiu/xuzhu", "/d/lingjiu/dating" }),
	"少林派"   : ({ "/kungfu/class/shaolin/xuan-ci", "/d/shaolin/fzlou2" }),
	"神龙教"   : ({ "/kungfu/class/shenlong/hong", "/d/shenlong/dating" }),
	"桃花岛"   : ({ "/kungfu/class/taohua/huang", "/d/taohua/dating" }),
	"武当派"   : ({ "/kungfu/class/wudang/zhang", "/d/wudang/xiaoyuan" }),
	"逍遥派"   : ({ "/kungfu/class/xiaoyao/suxingh", "/d/xiaoyao/qingcaop" }),
	"星宿派"   : ({ "/kungfu/class/xingxiu/ding", "/d/xingxiu/riyuedong" }),
	"血刀门"   : ({ "/kungfu/class/xuedao/laozu", "/d/xuedao/shandong3" }),
	"雪山寺"   : ({ "/kungfu/class/xueshan/jiumozhi", "/d/xueshan/neidian" }),
	"云龙门"   : ({ "/kungfu/class/yunlong/chen", "/d/beijing/qingmu_dating" }),
	"段氏皇族" : ({ "/kungfu/class/duan/duanzc", "/d/dali/neitang" }),
	"慕容世家" : ({ "/kungfu/class/murong/murongbo", "/d/yanziwu/shangyu" }),
	"欧阳世家" : ({ "/kungfu/class/ouyang/ouyangfeng", "/d/baituo/dating" }),
	"关外胡家" : ({ "/kungfu/class/hu/hufei", "/d/guanwai/xiaowu" }),
	"华山剑宗" : ({ "/kungfu/class/huashan/feng-buping", "/d/huashan/xiaowu" }),
]);

// fly 指令的落点（与 /cmds/usr/fly.c 一致）
mapping flys = ([
	"yz":"/d/city/guangchang", "bj":"/d/beijing/tiananmen", "cd":"/d/city3/guangchang",
	"ca":"/d/changan/bridge2", "fz":"/d/fuzhou/dongjiekou", "fs":"/d/foshan/street3",
	"qz":"/d/quanzhou/zhongxin", "jx":"/d/quanzhou/jiaxing", "hz":"/d/hangzhou/road10",
	"sz":"/d/suzhou/canlangting", "wugong":"/d/quanzhen/zhongxin", "ts":"/d/taishan/taishanjiao",
	"dl":"/d/dali/center", "ny":"/d/shaolin/nanyang", "xy":"/d/xiangyang/guangchang",
	"yd":"/d/huanghe/yongdeng", "lz":"/d/lingzhou/center", "hy":"/d/henshan/hengyang",
	"xx":"/d/xingxiu/xxh1", "bt":"/d/baituo/guangchang", "qzj":"/d/quanzhen/damen",
	"zhongnan":"/d/quanzhen/shanjiao", "gm":"/d/gumu/mumen", "mr":"/d/yanziwu/hupan",
	"yzw":"/d/yanziwu/bozhou", "lj":"/d/lingjiu/jian", "sl":"/d/shaolin/shanmen",
	"rz":"/d/shaolin/ruzhou", "wd":"/d/wudang/jiejianyan", "xyg":"/d/xiaoyao/xiaodao4",
	"hs":"/d/huashan/shaluo", "hsjz":"/d/huashan/pingdi", "xs":"/d/xuedao/nroad4",
	"xd":"/d/xuedao/wangyougu", "kl":"/d/kunlun/klshanlu", "em":"/d/emei/huayanding",
	"jinding":"/d/emei/jinding", "mj":"/d/mingjiao/shanjiao", "nanhai":"/d/xiakedao/haibin",
	"guiyun":"/d/guiyun/taihu", "thd":"/d/taohua/tingzi", "hmy":"/d/heimuya/up1",
	"shenlong":"/d/shenlong/kongdi", "hujia":"/d/guanwai/baihe", "gw":"/d/guanwai/jishi",
]);

void tick(object me);
void stop(object me, string reason);

string norm(string f)
{
	if (! stringp(f)) return 0;
	if (f[0] != '/') f = "/" + f;
	if (strlen(f) > 2 && f[<2..<1] == ".c") f = f[0..<3];
	return f;
}

object get_room(string f)
{
	object r;
	if (! f) return 0;
	if (objectp(r = find_object(f))) return r;
	catch(r = load_object(f));
	return r;
}

void note(object me, mapping s, string msg)
{
	if (s["msg"] == msg) return;
	s["msg"] = msg;
	tell_object(me, HIC "【自动师门】" NOR + msg + "\n");
}

// 广度优先找路。goal 为房间文件；goal 为 0 时找最近的户外房间。
// 返回 ({ ({ 起点, 指令, 终点 }), ... })，找不到返回 0。
mixed *bfs(string from, string goal, int limit, mapping block)
{
	mapping prev = ([ from : 0 ]);
	string *queue = ({ from });
	int head = 0;

	while (head < sizeof(queue))
	{
		string cur = queue[head++];
		object room = get_room(cur);
		mapping ex;

		if (! room) continue;
		if (goal ? cur == goal : (room->query("outdoors") && cur != ROOM_KONGZHONG))
		{
			mixed *path = ({ });
			while (arrayp(prev[cur]))
			{
				path = ({ ({ prev[cur][0], "go " + prev[cur][1], cur }) }) + path;
				cur = prev[cur][0];
			}
			return path;
		}
		if (sizeof(queue) >= limit) continue;
		if (! mapp(ex = room->query("exits"))) continue;
		foreach (string dir, mixed dest in ex)
		{
			string f;
			if (! stringp(dest)) continue;
			f = norm(dest);
			if (mapp(block) && block[cur + ">" + dir]) continue;
			if (! undefinedp(prev[f])) continue;
			prev[f] = ({ cur, dir });
			queue += ({ f });
		}
	}
	return 0;
}

string area(string f)
{
	string a;
	if (sscanf(f, "/d/%s/%*s", a) == 2) return a;
	return "";
}

// 计算从 here 到 goal 的行程：步行，或先走到户外、飞到最近的落点、再步行。
mixed *plan_route(string here, string goal, mapping block)
{
	mixed *walk, *best, *p1, *p2;
	string *keys, *same = ({ }), *other = ({ });
	int n = 0;

	walk = bfs(here, goal, BFS_LIMIT, block);
	if (arrayp(walk) && sizeof(walk) <= 20) return walk;

	if (! arrayp(p1 = bfs(here, 0, 400, block))) return walk;

	keys = keys(flys);
	foreach (string k in keys)
		if (area(flys[k]) == area(goal)) same += ({ k }); else other += ({ k });

	foreach (string k in same + other)
	{
		if (n >= 6 && arrayp(best)) break;
		if (n >= 12) break;
		n++;
		p2 = bfs(flys[k], goal, FLY_BFS_LIMIT, block);
		if (! arrayp(p2)) continue;
		p2 = ({ ({ (sizeof(p1) ? p1[<1][2] : here), "fly " + k, flys[k] }) }) + p2;
		if (! arrayp(best) || sizeof(p2) < sizeof(best)) best = p2;
		if (sizeof(p2) <= 3) break;
	}
	if (! arrayp(best)) return walk;
	best = p1 + best;
	if (arrayp(walk) && sizeof(walk) <= sizeof(best) + 8) return walk;
	return best;
}

object find_master(object room, string file)
{
	if (! room) return 0;
	foreach (object ob in all_inventory(room))
		if (living(ob) && base_name(ob) == file) return ob;
	return 0;
}

object find_target(object me, string file, string id)
{
	foreach (object ob in children(file))
	{
		if (! objectp(ob) || clonep(ob) == 0 || ! environment(ob)) continue;
		if (ob->query("id") != id) continue;
		if (file == KILLED && ob->query_temp("quester") != me->query("id")) continue;
		return ob;
	}
	return 0;
}

object find_bow(object me)
{
	foreach (object ob in all_inventory(me))
		if (inherits("/clone/weapon/bow", ob) || base_name(ob) == "/clone/weapon/bow")
			return ob;
	return 0;
}

int arrow_count(object me)
{
	int n = 0;
	foreach (object ob in all_inventory(me))
		if (ob->is_arrow()) n += ob->query_amount() ? ob->query_amount() : 1;
	return n;
}

// 走向 goal，一次一步。到达返回 1，正在走返回 0，走不通返回 -1。
int go_to(object me, mapping s, string goal)
{
	string here = base_name(environment(me));
	mixed *step;

	if (here == goal) { s["path"] = 0; s["expect"] = 0; return 1; }

	if (arrayp(s["expect"]))
	{
		step = s["expect"];
		s["expect"] = 0;
		if (here == step[2] && arrayp(s["path"]) && sizeof(s["path"]))
			s["path"] = s["path"][1..];
		else if (here == step[0])
		{
			// 这一步没走成：门关着、有人拦路、需要特殊指令等，换条路
			if (step[1][0..2] == "go ")
				s["block"][step[0] + ">" + step[1][3..]] = 1;
			s["path"] = 0;
			s["stuck"]++;
		} else
			s["path"] = 0;
	}

	if (s["goal"] != goal || ! arrayp(s["path"]) || ! sizeof(s["path"]) || s["path"][0][0] != here)
	{
		s["goal"] = goal;
		s["path"] = plan_route(here, goal, s["block"]);
		if (! arrayp(s["path"]) || ! sizeof(s["path"]))
		{
			s["path"] = 0;
			return -1;
		}
	}
	if (s["stuck"] > 12) return -1;

	step = s["path"][0];
	s["expect"] = step;
	me->force_me(step[1]);
	return 0;
}

void stop(object me, string reason)
{
	mapping s;
	if (! objectp(me)) return;
	s = me->query_temp("autoquest");
	me->delete_temp("autoquest");
	if (reason)
		tell_object(me, HIY "【自动师门】已停止：" NOR + reason +
			(mapp(s) ? sprintf("（本次完成送信 %d 次、追杀 %d 次）", s["letter"], s["kill"]) : "") + "\n");
}

int start(object me)
{
	mapping s = me->query_temp("autoquest");
	if (mapp(s) && s["on"]) return 0;
	s = ([ "on" : 1, "gen" : time() + random(100000), "block" : ([ ]),
		"letter" : 0, "kill" : 0, "stuck" : 0, "idle" : 0, "asks" : 0 ]);
	me->set_temp("autoquest", s);
	tell_object(me, HIC "【自动师门】开始。再点一次「自动师门」可以停止。\n" NOR);
	call_out("tick", TICK, me, s["gen"]);
	return 1;
}

mapping query_state(object me) { return me->query_temp("autoquest"); }

// 给自动修炼用：门派掌门表，和按同样规则（步行 / 飞行）走到某个房间
mapping query_masters() { return masters; }
int walk_to(object me, mapping s, string goal)
{
	if (! mapp(s["block"])) s["block"] = ([ ]);
	return go_to(me, s, goal);
}

// 战斗中的处理
void fight(object me, mapping s, object target)
{
	object bow;
	if (me->query("qi") < me->query("max_qi") / 4 && me->query("neili") > 50)
	{
		me->force_me("exert recover");
		return;
	}
	if (me->query("eff_qi") < me->query("max_qi") / 5 || me->query("qi") < me->query("max_qi") / 8)
	{
		// 打不过，先撤
		mapping ex = environment(me)->query("exits");
		if (mapp(ex) && sizeof(ex))
		{
			note(me, s, "气血太低，先撤退休息。");
			s["rest"] = 1;
			s["path"] = 0;
			me->force_me("go " + keys(ex)[random(sizeof(ex))]);
		}
		return;
	}
	if (! target || environment(target) != environment(me) || ! me->is_fighting(target))
		return;
	if (objectp(bow = find_bow(me)) && me->query_temp("handing") == bow &&
	    arrow_count(me) > 0 && me->query("jing") >= 80 &&
	    me->query("combat_exp") >= 10000)
		me->force_me("shot " + target->query("id") + " with arrow");
}

// 平时的保养：吃喝、回气血
int upkeep(object me, mapping s)
{
	if (me->query("food") < me->max_food_capacity() / 4 ||
	    me->query("water") < me->max_water_capacity() / 4)
	{
		me->set("food", me->max_food_capacity());
		me->set("water", me->max_water_capacity());
		tell_object(me, HIC "【自动师门】" NOR "你觉得饿了，系统送来牛奶和面包，你吃饱喝足。\n");
	}
	if (s["rest"])
	{
		if (me->query("qi") >= me->query("eff_qi") * 9 / 10 &&
		    me->query("eff_qi") >= me->query("max_qi") * 7 / 10)
		{
			s["rest"] = 0;
			return 0;
		}
		if (me->query("qi") < me->query("eff_qi") && me->query("neili") > 30)
			me->force_me("exert recover");
		note(me, s, "休息中，等气血恢复……");
		if (++s["resting"] > 600) stop(me, "休息太久，气血一直没有恢复。");
		return 1;
	}
	s["resting"] = 0;
	if (me->query("qi") < me->query("eff_qi") * 2 / 3 && me->query("neili") > 30)
	{
		me->force_me("exert recover");
		return 1;
	}
	return 0;
}

// 买箭：钱够就去扬州打铁铺
int buy_arrows(object me, mapping s)
{
	int r;
	int v = 0;
	foreach (string m, int k in ([ "coin_money":1, "silver_money":100, "gold_money":10000, "cash_money":100000 ]))
	{
		object o = present(m, me);
		if (o) v += o->query_amount() * k;
	}
	if (v < 5000) return 0;	// 不到五十两银子就不去买了
	r = go_to(me, s, SMITH_ROOM);
	if (r < 0) return 0;
	if (r == 0) { note(me, s, "箭用完了，去扬州打铁铺买箭。"); return 1; }
	me->force_me("buy 50 arrow from smith");
	s["bought"]++;
	if (arrow_count(me) <= 0 || s["bought"] > 3)
	{
		s["noarrow"] = 1;
		note(me, s, "买不到箭（可能钱不够），改用普通招式战斗。");
	}
	return 1;
}

void tick(object me, int gen)
{
	mapping s, q;
	string fam, mroom, here;
	object master, target, env, bow;
	int r;

	if (! objectp(me)) return;
	s = me->query_temp("autoquest");
	if (! mapp(s) || ! s["on"] || s["gen"] != gen) return;
	call_out("tick", TICK, me, gen);

	if (! interactive(me) && ! me->query_temp("netdead_ok")) { stop(me, "你已经离线。"); return; }
	if (me->is_ghost()) { stop(me, "你死了。"); return; }
	if (! living(me)) return;
	if (! objectp(env = environment(me))) return;
	if (me->query_temp("is_flying") || base_name(env) == ROOM_KONGZHONG) return;
	q = me->query("quest");

	// 统计完成次数：上一个任务消失或换成了新的
	{
		string cur = mapp(q) ? q["type"] + ":" + q["id"] : "";
		if (stringp(s["cur"]) && s["cur"] != "" && s["cur"] != cur)
		{
			if (s["cur"][0..6] == "letter:") s["letter"]++;
			else if (s["cur"][0..4] == "kill:") s["kill"]++;
			s["block"] = ([ ]);
			s["stuck"] = 0;
		}
		s["cur"] = cur;
	}

	// 正在战斗（忙乱时也要尝试，射箭/运功本身会判断能不能做）
	if (me->is_fighting())
	{
		target = 0;
		if (mapp(q) && q["type"] == "kill")
			target = find_target(me, KILLED, q["id"]);
		fight(me, s, target);
		return;
	}

	if (me->is_busy() || me->query("doing")) return;

	fam = me->query("family/family_name");
	if (! stringp(fam) || ! arrayp(masters[fam]))
	{
		stop(me, "你还没有拜入可以领师门任务的门派。");
		return;
	}
	mroom = masters[fam][1];
	here = base_name(env);

	if (upkeep(me, s)) return;

	// 追杀完成后师门送来的下一个任务
	if (! mapp(q) && present("quest letter", me))
	{
		me->force_me("accept quest");
		return;
	}

	// 没有任务：回师父那里领
	if (! mapp(q))
	{
		int exp = me->query("combat_exp");
		if (exp >= 30000 && exp < 50000)
		{
			stop(me, "经验在三万到五万之间，师父不会给你派任务，先去练功吧。");
			return;
		}
		r = go_to(me, s, mroom);
		if (r < 0) { stop(me, "找不到去师父那里的路。"); return; }
		if (r == 0) { note(me, s, "回师父那里领任务。"); return; }
		master = find_master(env, masters[fam][0]);
		if (! master) { note(me, s, "师父不在，等一会儿。"); return; }
		if (exp >= 50000 && ! me->query("out_family"))
		{
			if (s["asks"]++ > 2) { stop(me, "师父不肯让你出去历练。"); return; }
			me->force_me("ask " + master->query("id") + " about 历练");
			return;
		}
		if (s["takes"]++ > 4) { stop(me, "师父一直不给任务（可能声望、阅历或本周次数不够）。"); return; }
		me->force_me("quest " + master->query("id"));
		s["path"] = 0;
		return;
	}
	s["takes"] = 0;

	if (q["type"] == "letter")
	{
		object receipt = present("receipt", me);
		if (receipt)
		{
			r = go_to(me, s, mroom);
			if (r < 0) { stop(me, "找不到回师父那里的路。"); return; }
			if (r == 0) { note(me, s, "带着回执回去复命。"); return; }
			master = find_master(env, masters[fam][0]);
			if (! master) { note(me, s, "师父不在，等一会儿。"); return; }
			me->force_me("give receipt to " + master->query("id"));
			s["block"] = ([ ]);
			s["stuck"] = 0;
			return;
		}
		if (! present("letter", me))
		{
			stop(me, "信不见了，放弃这个任务（去师父那里 quest cancel）。");
			return;
		}
		target = find_target(me, RECEIVER, q["id"]);
		if (! target) { stop(me, "收信人不见了，放弃这个任务吧。"); return; }
		r = go_to(me, s, base_name(environment(target)));
		if (r < 0)
		{
			if (s["retarget"]++ > 5) { stop(me, "找不到去" + target->name() + "那里的路。"); return; }
			s["block"] = ([ ]); s["stuck"] = 0; s["path"] = 0;
			return;
		}
		if (r == 0) { note(me, s, "去给" + target->name() + "送信（" + environment(target)->query("short") + "）。"); return; }
		me->force_me("give letter to " + target->query("id"));
		s["retarget"] = 0;
		return;
	}

	if (q["type"] == "kill")
	{
		target = find_target(me, KILLED, q["id"]);
		if (! target)
		{
			if (s["lost"]++ > 30) { stop(me, "找不到要追杀的" + q["name"] + "（可能已经跑掉或超时）。"); return; }
			note(me, s, "正在打听" + q["name"] + "的下落……");
			return;
		}
		s["lost"] = 0;
		if (objectp(bow = find_bow(me)) && me->query_temp("handing") != bow)
		{
			me->force_me("hand " + bow->query("id"));
			return;
		}
		if (bow && arrow_count(me) <= 0 && ! s["noarrow"] && buy_arrows(me, s)) return;
		if (environment(target) != env)
		{
			r = go_to(me, s, base_name(environment(target)));
			if (r < 0)
			{
				if (s["retarget"]++ > 5) { stop(me, "找不到去" + target->name() + "那里的路。"); return; }
				s["block"] = ([ ]); s["stuck"] = 0; s["path"] = 0;
				return;
			}
			if (r == 0) note(me, s, "追杀" + target->name() + "（" + environment(target)->query("short") + "）。");
			return;
		}
		s["retarget"] = 0;
		s["path"] = 0;
		if (env->query("no_fight")) { note(me, s, target->name() + "在不能战斗的地方，等他出来。"); return; }
		note(me, s, "找到" + target->name() + "，动手！");
		me->force_me("kill " + target->query("id"));
		return;
	}

	stop(me, "这种任务（" + q["type"] + "）暂不支持自动完成。");
}
