
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
  int i;
  int len = strlen(str);
  // FluffOS strings are Unicode: every char must be CJK
  if(len < 1) return 0;
  for(i=0; i<len; i++)
    if(str[i] < 0x2E80 || str[i] > 0x9FFF) return 0;
  return 1;
}

int utf8_strlen(string str)
{
  int i;
  int n = 0;
  int len = strlen(str);
  for(i=0; i<len; i++) {
    if ((str[i] & 0xC0) != 0x80) n++;
  }
  return n;
}
