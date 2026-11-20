// autoload.c

string *autoload;
// 网页单机版：普通物品（武器、衣服、秘籍、药品、食物、杂物）也随存档保留。
// 每项 ([ "f": 文件, "id": id 列表, "d": dbase, "e": 装备状态, "in": 容器内物品 ])
mixed *keepitems;

#define KEEP_MAX 80

void clean_up_autoload() { autoload = 0; keepitems = 0; }

// 不保留：任务物品、唯一/宝物、绑定主人、尸体活物肉、自带存档的系统物件
int keep_ok(object ob)
{
	string f;

	if (! objectp(ob) || ! clonep(ob)) return 0;
	if (ob->query_autoload()) return 0;	 // 原来就会保留，按原方式处理
	if (ob->is_character() || ob->is_corpse() || ob->is_no_clone()) return 0;
	if (function_exists("violate_unique", ob)) return 0;
	if (function_exists("query_save_file", ob)) return 0;
	if (ob->query("unique") || ob->query("treasure") || ob->query("owner") ||
	    ob->query("quest") || ob->query("money_id") || ob->query("material") == "meat" ||
	    ob->query("no_keep"))
		return 0;
	f = base_name(ob);
	if (f[0..13] == "/clone/questob" || f[0..5] == "/data/" || f[0..10] == "/clone/user")
		return 0;
	return 1;
}

mapping keep_entry(object ob)
{
	mapping db, m;
	mixed v;
	string k;

	db = ([ ]);
	if (mapp(m = ob->query_entire_dbase()))
		foreach (k, v in m)
		{
			if (k == "equipped" || functionp(v) || objectp(v)) continue;
			db[k] = v;
		}
	m = ([ "f" : base_name(ob), "d" : db ]);
	if (arrayp(v = ob->parse_command_id_list())) m["id"] = v;
	if (stringp(v = ob->query("equipped"))) m["e"] = v;
	return m;
}

void save_keepitems()
{
	object *inv, *sub;
	mapping m;
	int i, j;

	keepitems = ({ });
	if (! this_object()->is_player()) return;
	inv = all_inventory();
	for (i = 0; i < sizeof(inv) && sizeof(keepitems) < KEEP_MAX; i++)
	{
		if (! keep_ok(inv[i])) continue;
		m = keep_entry(inv[i]);
		sub = all_inventory(inv[i]);
		if (sizeof(sub))
		{
			m["in"] = ({ });
			for (j = 0; j < sizeof(sub) && j < 40; j++)
				if (keep_ok(sub[j])) m["in"] += ({ keep_entry(sub[j]) });
		}
		keepitems += ({ m });
	}
}

object keep_make(mapping m, object dest)
{
	object ob;
	string k;
	mixed v;

	if (! mapp(m) || ! stringp(m["f"]) || file_size(m["f"] + ".c") <= 0) return 0;
	if (catch(ob = new(m["f"])) || ! ob) return 0;
	if (! keep_ok(ob)) { destruct(ob); return 0; }
	export_uid(ob);
	if (mapp(m["d"]))
		foreach (k, v in m["d"])
			ob->set(k, v);
	if (arrayp(m["id"]) && sizeof(m["id"]))
		ob->set_name(ob->query("name"), m["id"]);
	ob->move(dest, 1);
	return ob;
}

void restore_keepitems()
{
	object ob, me;
	mixed m, c;
	int lost;

	if (! arrayp(keepitems)) return;
	me = this_object();
	foreach (m in keepitems)
	{
		if (! (ob = keep_make(m, me))) { lost++; continue; }
		if (arrayp(m["in"]))
			foreach (c in m["in"])
				if (! keep_make(c, ob)) lost++;
		if (m["e"] == "worn") ob->wear();
		else if (m["e"] == "wielded") ob->wield();
	}
	if (lost)
		log_file("autoload", sprintf("keepitems: %d lost for %s\n", lost, me->query("id")));
	keepitems = 0;
}

void save_autoload()
{
	object *inv;
	object *obs;
	int i, j;
	mixed param;

	inv = all_inventory();
	if (arrayp(obs = this_object()->query_temp("hire")))
		inv += obs - ({ 0 });
	autoload = allocate(sizeof(inv));
	for (i = 0, j = 0; i < sizeof(inv); i++)
	{
		if( !(param = inv[i]->query_autoload()) ) continue; 
		autoload[j] = base_name(inv[i]);
		if (stringp(param)) autoload[j] += ":" + param;
		j++;
	}
	autoload = autoload[0..j - 1];
	save_keepitems();
}

void restore_autoload()
{
	int i,num;
	object ob;
	string file, param, err;
	int has_dropped;

	if (! pointerp(autoload)) { restore_keepitems(); return; }

	has_dropped = 0;
	for (i = 0; i < sizeof(autoload); i++)
	{
		if (! autoload[i] || autoload[i] == "")
			continue;

		if (sscanf(autoload[i], "%s:%s", file, param) != 2)
		{
			file = autoload[i];
			param = 0;
		}
		if (file_size(file + ".c") > 0)
		{
			err = catch(call_other(file, "???"));
			ob = find_object(file);
		} else
		{
			err = 0;
			ob = 0;
		}
		if (ob && ! ob->is_no_clone()) ob = new(file);
		if (err || ! ob || ob->is_no_clone() && environment(ob))
		{
			string temp;
			if (file && sscanf(file, "/data/%*s/%s", temp))
			{
				if (has_dropped) continue;
				has_dropped++;
				write("你发现有些东西已经没有用了，随手就扔掉了。\n");
			} else
				write("你觉得似乎失落了什么重要的东西，最好通知一下巫师。\n");
			log_file("autoload", sprintf("Fail to autoload %s of %s, error %s(%s)\n",
				 file, this_object()->query("name"),
				 this_object()->query("id"),
				 ob ? "The no clone object has existed" : err));
			continue;
		}
		if (ob->is_no_clone() && ob->is_not_belong_me(this_object()))
		{
			if (! environment(ob)) destruct(ob);
			continue;
		}

		export_uid(ob);
		if (! ob->is_character())
			ob->move(this_object(), 1);

		ob->autoload(param, this_object());
	}
	restore_keepitems();
	clean_up_autoload();		// To save memory.
}

string *query_autoload_info()
{
	return autoload;
}

void set_autoload_info(string *data)
{
	autoload = data;
}
