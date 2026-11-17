
string chinese_number(int i)
{
	return CHINESE_D->chinese_number(i);
}

string to_chinese(string str)
{
	return CHINESE_D->chinese(str);
}

int is_chinese(string str)
{
	if( strlen(str)>=1 && str[0] >= 0x2E80 && str[0] <= 0x9FFF ) return 1;
	return 0;
}
