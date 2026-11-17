import os,sys
root=sys.argv[1]; bad=[]; n=0; skip=('.exe','.dll','.jpg','.gif','.png','.ico','.zip','.rar','.swf','.mid','.wav')
for r,ds,fs in os.walk(root):
    for f in fs:
        p=os.path.join(r,f)
        if f.lower().endswith(skip): continue
        b=open(p,'rb').read()
        if b'\0' in b[:4096]: bad.append('BIN '+p); continue
        try: s=b.decode('utf-8'); enc='u8'
        except UnicodeDecodeError:
            try: s=b.decode('gb18030')
            except UnicodeDecodeError: s=b.decode('gb18030',errors='replace'); bad.append('REPL '+p)
        s=s.replace('\r\n','\n').replace('\r','\n')
        open(p,'w',encoding='utf-8').write(s); n+=1
print('converted',n); print('\n'.join(bad[:60])); print('issues',len(bad))
