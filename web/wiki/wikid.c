// wikid.c — dump game data (skills, npcs, rooms, items) as JSON lines for the offline wiki.
// Run: call /adm/daemons/wikid->start()  →  writes /log/wiki/*.jsonl, then /log/wiki/done
#include <ansi.h>

#define OUT "/log/wiki/"
#define BATCH 40

string *queue = ({});
string *outbuf = ({});
int finished;
string kind;
int total;

string js(mixed v);

string jstr(string s)
{
	if (! stringp(s)) return "null";
	s = replace_string(s, "\\", "\\\\");
	s = replace_string(s, "\"", "\\\"");
	s = replace_string(s, "\n", "\\n");
	s = replace_string(s, "\r", "");
	s = replace_string(s, "\t", " ");
	s = replace_string(s, "\033", "\\u001b");
	return "\"" + s + "\"";
}

string js(mixed v)
{
	string *ks, r;
	int i;
	if (intp(v)) return "" + v;
	if (floatp(v)) return sprintf("%f", v);
	if (stringp(v)) return jstr(v);
	if (objectp(v)) return jstr(base_name(v));
	if (functionp(v)) return "null";
	if (arrayp(v))
	{
		r = "[";
		for (i = 0; i < sizeof(v); i++) r += (i ? "," : "") + js(v[i]);
		return r + "]";
	}
	if (mapp(v))
	{
		ks = keys(v);
		r = "{";
		for (i = 0; i < sizeof(ks); i++)
			r += (i ? "," : "") + jstr("" + ks[i]) + ":" + js(v[ks[i]]);
		return r + "}";
	}
	return "null";
}

string *walk(string dir, int deep)
{
	string *res = ({}), *fs;
	mixed *ents;
	int i;
	ents = get_dir(dir, -1);
	if (! arrayp(ents)) return res;
	for (i = 0; i < sizeof(ents); i++)
	{
		string n = ents[i][0];
		if (n == "." || n == "..") continue;
		if (ents[i][1] == -2) { if (deep) res += walk(dir + n + "/", deep); }
		else if (strlen(n) > 2 && n[<2..] == ".c") res += ({ dir + n[0..<3] });
	}
	return res;
}

void emit(string line) { outbuf += ({ line }); }

// JS 端轮询：每次取走最多 n 行；返回 JSON {"done":0|1,"lines":[...]}
string fetch(mixed n)
{
	string *b;
	int k = 200;
	while (arrayp(n) && sizeof(n)) n = n[0];
	if (intp(n) && n > 0) k = n;
	b = outbuf[0..k - 1];
	outbuf = outbuf[k..];
	return "{\"done\":" + ((finished && ! sizeof(outbuf)) ? 1 : 0) + ",\"left\":" + sizeof(queue) + ",\"lines\":[" + implode(b, ",") + "]}";
}

// ---------- skills ----------
nosave string *usages = ({ "force", "dodge", "parry", "unarmed", "cuff", "strike", "finger", "hand", "claw",
	"sword", "blade", "staff", "club", "whip", "hammer", "axe", "throwing", "dagger", "spear", "fork",
	"medical", "poison", "array", "magic", "spells", "move", "zhenfa" });

void do_skill(string f)
{
	object ob = load_object(f);
	string id = explode(f, "/")[<1], *en = ({}), *pf = ({});
	mixed *ents;
	int i;
	mapping m = ([]);
	if (! ob) return;
	for (i = 0; i < sizeof(usages); i++)
		if (catch(ob->valid_enable(usages[i])) == 0 && ob->valid_enable(usages[i])) en += ({ usages[i] });
	ents = get_dir(f + "/", -1);
	if (arrayp(ents))
		for (i = 0; i < sizeof(ents); i++)
		{
			string n = ents[i][0], qn;
			object p;
			if (ents[i][1] == -2 || strlen(n) < 3 || n[<2..] != ".c") continue;
			n = n[0..<3];
			if (catch(p = load_object(f + "/" + n)) || ! p) continue;
			qn = p->query_name();
			pf += ({ n + "\t" + (stringp(qn) ? qn : "") + "\t" + (function_exists("perform", p) ? "perform" : function_exists("exert", p) ? "exert" : "") });
		}
	m["id"] = id;
	m["name"] = to_chinese(id);
	m["type"] = ob->type();
	m["enable"] = en;
	m["pfm"] = pf;
	catch(m["actions"] = sizeof(ob->query("action")));
	emit(js(m));
}

// ---------- npcs ----------
void do_npc(string f)
{
	object ob;
	mapping m = ([]), sk, fam;
	object *inv;
	int i;
	if (catch(ob = load_object(f)) || ! ob || ! ob->is_character()) return;
	m["f"] = f;
	m["name"] = ob->query("name");
	m["ids"] = ob->parse_command_id_list();
	m["nick"] = ob->query("nickname");
	m["title"] = ob->query("title");
	m["gender"] = ob->query("gender");
	m["age"] = ob->query("age");
	m["exp"] = ob->query("combat_exp");
	m["qi"] = ob->query("max_qi");
	m["neili"] = ob->query("max_neili");
	m["shen"] = ob->query("shen_type");
	m["long"] = ob->query("long");
	if (mapp(fam = ob->query("family")))
		m["fam"] = ([ "n" : fam["family_name"], "g" : fam["generation"], "t" : fam["title"] ]);
	if (mapp(sk = ob->query_skills())) m["sk"] = sk;
	if (mapp(sk = ob->query_skill_map())) m["map"] = sk;
	if (arrayp(ob->query("vendor_goods"))) m["sell"] = ob->query("vendor_goods");
	m["teach"] = function_exists("attempt_apprentice", ob) ? 1 : 0;
	m["lt"] = function_exists("recognize_apprentice", ob) ? 1 : 0;
	inv = all_inventory(ob);
	m["inv"] = map(inv, (: base_name($1) :));
	emit(js(m));
	foreach (object o in inv) if (o) destruct(o);
	destruct(ob);
}

// ---------- rooms ----------
void do_room(string f)
{
	object ob;
	mapping m = ([]), ex, objs;
	string *ks;
	int i;
	int keep = 0;
	// 开机就加载好的房间（出生的客栈等）照样读，但不销毁
	if (ob = find_object(f)) keep = 1;
	else if (catch(ob = load_object(f)) || ! ob) return;
	if (! stringp(ob->query("short"))) { if (! keep) destruct(ob); return; }
	m["f"] = f;
	m["s"] = ob->query("short");
	m["o"] = ob->query("outdoors");
	if (mapp(ex = ob->query("exits")))
	{
		mapping e = ([]);
		ks = keys(ex);
		for (i = 0; i < sizeof(ks); i++) if (stringp(ex[ks[i]])) e[ks[i]] = ex[ks[i]];
		m["e"] = e;
	}
	if (mapp(objs = ob->query("objects")))
	{
		mapping o = ([]);
		ks = keys(objs);
		for (i = 0; i < sizeof(ks); i++) if (stringp(ks[i])) o[ks[i]] = objs[ks[i]];
		m["n"] = o;
	}
	if (ob->query("no_fight")) m["nf"] = 1;
	if (ob->query("sleep_room")) m["sl"] = 1;
	emit(js(m));
	if (keep) return;
	foreach (object o in deep_inventory(ob)) if (o && ! userp(o)) destruct(o);
	destruct(ob);
}

// ---------- items ----------
void do_item(string f)
{
	object ob;
	mapping m = ([]);
	if (catch(ob = load_object(f)) || ! ob || ob->is_character()) return;
	if (! stringp(ob->query("name"))) { destruct(ob); return; }
	m["f"] = f;
	m["name"] = ob->query("name");
	m["unit"] = ob->query("unit");
	m["value"] = ob->query("value");
	m["w"] = ob->query_weight();
	m["long"] = ob->query("long");
	m["skill"] = ob->query("skill");          // books
	m["wp"] = ob->query("weapon_prop");
	m["ap"] = ob->query("armor_prop");
	m["skt"] = ob->query("skill_type");
	m["at"] = ob->query("armor_type");
	m["food"] = ob->query("food_supply");
	m["water"] = ob->query("liquid");
	emit(js(m));
	destruct(ob);
}

void step()
{
	int i;
	for (i = 0; i < BATCH && sizeof(queue); i++)
	{
		string f = queue[0];
		queue = queue[1..];
		catch(call_other(this_object(), "do_" + kind, f));
	}
	if (sizeof(queue)) { call_out("step", 0); return; }
	finished = 1;
}

void run(string k, string *dirs)
{
	kind = k;
	queue = ({});
	foreach (string d in dirs) queue += walk(d, k != "skill");
	if (k == "npc") queue = filter(queue, (: strsrch($1, "/npc/") >= 0 || strsrch($1, "/kungfu/class/") == 0 || strsrch($1, "/clone/beast/") == 0 :));
	if (k == "item") queue = filter(queue, (: strsrch($1, "/clone/") == 0 || strsrch($1, "/obj/") >= 0 :));
	if (k == "room") queue = filter(queue, (: strsrch($1, "/npc/") < 0 && strsrch($1, "/obj/") < 0 :));
	total = sizeof(queue);
	finished = 0;
	outbuf = ({});
	call_out("step", 0);
}

void start(mixed k)
{
	while (arrayp(k) && sizeof(k)) k = k[0];
	if (! stringp(k)) return;
	seteuid(ROOT_UID);
	if (k == "skill") run(k, ({ "/kungfu/skill/" }));
	else if (k == "npc") run(k, ({ "/d/", "/kungfu/class/", "/adm/npc/", "/clone/beast/", "/clone/npc/", "/clone/fuben/" }));
	else if (k == "room") run(k, ({ "/d/" }));
	else if (k == "item") run(k, ({ "/clone/", "/d/" }));
}

void create()
{
	seteuid(ROOT_UID);
#if efun_defined(js_export)
	js_export("wiki_start", (: start :));
	js_export("wiki_fetch", (: fetch :));
#endif
}
