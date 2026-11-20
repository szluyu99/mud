// websaved.c
// single-player browser build: lets the page ask the game to save every
// online player before the tab is hidden or closed (MudWasm calls
// "mudwasm_save" through the jsbridge).

int save_all()
{
	object ob, link_ob;
	int n;

	foreach (ob in users())
	{
		if (! objectp(ob) || ! ob->query("born")) continue;
		if (objectp(link_ob = ob->query_temp("link_ob"))) link_ob->save();
		if (ob->save()) n++;
		ob->set("last_save", time());
	}
	return n;
}

// 百科「拜师条件」用：报告当前玩家的属性、技能，交给网页逐条比对。
string jq(string s)
{
	if (! stringp(s)) return "null";
	s = replace_string(s, "\\", "\\\\");
	s = replace_string(s, "\"", "\\\"");
	return "\"" + s + "\"";
}

string player_stats()
{
	object ob;
	mapping sk;
	string r, *ks;
	int i;

	foreach (ob in users())
		if (objectp(ob) && ob->query("born")) break;
	if (! objectp(ob) || ! ob->query("born")) return "null";
	r = "{\"name\":" + jq(ob->query("name")) +
	    ",\"gender\":" + jq(ob->query("gender")) +
	    ",\"class\":" + jq(ob->query("class")) +
	    ",\"fam\":" + jq(ob->query("family/family_name")) +
	    ",\"master\":" + jq(ob->query("family/master_id")) +
	    ",\"a\":{\"int\":" + ob->query_int() + ",\"str\":" + ob->query_str() +
	    ",\"con\":" + ob->query_con() + ",\"dex\":" + ob->query_dex() +
	    ",\"per\":" + ob->query_per() + ",\"kar\":" + ob->query_kar() + "}" +
	    ",\"p\":{";
	ks = ({ "combat_exp", "shen", "max_neili", "max_jingli", "age", "per", "int", "str", "con", "dex", "kar", "score", "weiwang" });
	for (i = 0; i < sizeof(ks); i++) r += (i ? "," : "") + "\"" + ks[i] + "\":" + to_int(ob->query(ks[i]));
	r += "},\"b\":{";
	sk = ob->query_skills();
	if (! mapp(sk)) sk = ([]);
	ks = keys(sk);
	for (i = 0; i < sizeof(ks); i++) r += (i ? "," : "") + jq(ks[i]) + ":" + sk[ks[i]];
	r += "},\"e\":{";
	for (i = 0; i < sizeof(ks); i++) r += (i ? "," : "") + jq(ks[i]) + ":" + ob->query_skill(ks[i]);
	// 「我的角色」页用：激发、当前状态、所在房间
	r += "},\"map\":{";
	sk = ob->query_skill_map();
	if (! mapp(sk)) sk = ([]);
	ks = keys(sk);
	for (i = 0; i < sizeof(ks); i++) r += (i ? "," : "") + jq(ks[i]) + ":" + jq(sk[ks[i]]);
	r += "},\"s\":{";
	ks = ({ "qi", "eff_qi", "max_qi", "jing", "eff_jing", "max_jing", "neili", "jingli", "potential", "learned_points", "food", "water", "balance", "mud_age", "family/generation" });
	for (i = 0; i < sizeof(ks); i++) r += (i ? "," : "") + "\"" + ks[i] + "\":" + to_int(ob->query(ks[i]));
	r += "},\"title\":" + jq(ob->query("title")) + ",\"nick\":" + jq(ob->query("nickname")) +
	     ",\"id\":" + jq(ob->query("id")) +
	     ",\"room\":" + jq(environment(ob) ? base_name(environment(ob)) : 0);
	return r + "}";
}

void create()
{
	seteuid(ROOT_UID);
#if efun_defined(js_export)
	js_export("mudwasm_save", (: save_all :));
	js_export("mudwasm_stats", (: player_stats :));
#endif
}
