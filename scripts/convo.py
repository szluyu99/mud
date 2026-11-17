import os,sys
src,dst=sys.argv[1],sys.argv[2]; n=0
for r,ds,fs in os.walk(dst):
    for f in fs:
        if not f.endswith('.o'): continue
        p=os.path.join(r,f); q=os.path.join(src,os.path.relpath(p,dst))
        if not os.path.exists(q): continue
        b=open(q,'rb').read()
        try: s=b.decode('utf-8')
        except UnicodeDecodeError: s=b.decode('gb18030',errors='replace')
        if s.endswith('\r\n') or '\r\n' in s[:200]: s=s.replace('\r\n','\n')
        open(p,'w',encoding='utf-8',newline='').write(s); n+=1
print('reconv .o',n)
