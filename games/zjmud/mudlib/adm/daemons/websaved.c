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

void create()
{
	seteuid(ROOT_UID);
#if efun_defined(js_export)
	js_export("mudwasm_save", (: save_all :));
#endif
}
