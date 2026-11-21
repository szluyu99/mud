// 江湖远征：zjrogue 单人局内成长模式。
#include <ansi.h>

#define YZ_D "/adm/daemons/yuanzhengd"

int menu(object me)
{
    write(ZJOBLONG "江湖远征\n" + YZ_D->status(me) + "\n\n"
        "独立单人模式：本局有三条命，局内天赋不会带回普通江湖。\n"
        ZJOBACTS2 + ZJMENUF(3,3,8,30)
        "开始远征:yuanzheng start" ZJSEP
        "查看状态:yuanzheng status" ZJSEP
        "完成当前任务:yuanzheng complete" ZJSEP
        "选择天赋一:yuanzheng choose 1" ZJSEP
        "选择天赋二:yuanzheng choose 2" ZJSEP
        "选择天赋三:yuanzheng choose 3" ZJSEP
        "结算远征:yuanzheng settle" ZJSEP
        "放弃远征:yuanzheng abandon\n");
    return 1;
}

int main(object me, string arg)
{
    string sub; int n;
    if (!userp(me)) return 0;
    if (!arg || arg == "") return menu(me);
    if (sscanf(arg, "%s %d", sub, n) == 2) {
        if (sub == "choose") return YZ_D->choose(me, n);
    }
    if (arg == "start") return YZ_D->start(me);
    if (arg == "status") { write(YZ_D->status(me) + "\n"); return 1; }
    if (arg == "complete") return YZ_D->complete(me);
    if (arg == "settle") return YZ_D->settle(me);
    if (arg == "abandon") return YZ_D->abandon(me);
    return notify_fail("用法：yuanzheng（打开菜单），或 yuanzheng start/status/complete/choose 1/settle/abandon。\n");
}

int help(object me)
{
    write("远征：在五个就近地点完成剿匪、寻访、夺宝、护送、探查任务，每次完成后获得属性点并选择天赋。\n");
    return 1;
}
