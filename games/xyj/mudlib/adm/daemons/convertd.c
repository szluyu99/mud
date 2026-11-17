// 神话世界·西游记·版本４．５０
/* <SecCrypt CPL V3R05> */
 
/* rewritten by Snowcat */

#pragma optimize

inherit F_DBASE;

#define   SC_GBtoBIG   1
#define SC_BIGtoGB   2

#define SC_DO_SINGLE     0
#define SC_DO_ALL     1
#define SC_DO_ALL_BUT_SYMBOLS   2

#define SC_GB1   0xB0A1  /* starting code of GB Level 1 hanzi */
#define SC_BIG1   0xA440  /* starting code of BIG5 frequently-used hanzi */

#define BIGfirst 0xA140   /* first code of BIG */
#define BIGlast    0xF9FE   /* last code of BIG */
#define   BIGsize    0x58BF   /* BIGlast - BIGfirst + 1 */

#define GBbox   0xA1F5   /* GB code for the empty box symbol */
#define BIGbox   0xA1BC   /* BIG code for the empty box symbol */

#define BUFSIZE 256   /* Buffer size for each table entry. */

#define GBfirst    0xA1A1   /* first code of GB */
#define GBlast    0xFEFE   /* last code of GB */
#define GBsize    0x5E5E   /* GBlast - GBfirst + 1 */
/* Code mapping tables. */
// UTF-8 build: GB/BIG5 conversion tables removed, conversion is a pass-through.

string GB2BIG(string str) { return str; }
string BIG2GB(string str) { return str; }

void done(string arg,object me)
{
  string tmp,tmp_name;
  object ob,link_ob,ob1;
  
  if(!arg) 
        return 0;
  tmp=me->query("id");
  tmp_name=me->query("name");
  me->set("id",arg);
  me->set("body",USER_OB);
  ob=LOGIN_D->make_body(me);
  if (ob) {
           ob1=me;
           link_ob=ob1->query_temp("link_ob");
           exec(link_ob,ob1);
           ob1->set("id",tmp);
           ob1->set("name",tmp_name);
           ob1->set_temp("done",1);
           ob->restore();
           LOGIN_D->enter_world(link_ob,ob,1);
        }
}

string input(string str, object me) { return str; }
string output(string str, object me) { return str; }

void create()
{
   seteuid(getuid());
   set("name", "GB BIG5 converter");
   set("id", "GB BIG5 converter");
}
