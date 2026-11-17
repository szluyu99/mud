
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
	int i, c;

	if (!stringp(str) || strlen(str) < 1) return 0;
	for (i = 0; i < strlen(str); i++)
	{
		c = str[i];
		if (c < 0x2E80 || c > 0x9FFF) return 0;
	}
	return 1;
}
