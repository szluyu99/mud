import os,re,sys
root=sys.argv[1]
fn=re.compile(r'\bstatic\s+(varargs\s+|nomask\s+|private\s+)*[\w\s\*]*?\b\w+\s*\(')
n=0
for r,ds,fs in os.walk(root):
    for f in fs:
        if not f.endswith(('.c','.h')): continue
        p=os.path.join(r,f)
        try: s=open(p,encoding='utf-8').read()
        except UnicodeDecodeError: print('NONUTF8',p); continue
        lines=s.split('\n'); ch=False
        for i,l in enumerate(lines):
            code=l.split('//')[0]
            if not re.search(r'\bstatic\b',code): continue
            # skip occurrences only inside string literals
            if re.search(r'"[^"]*\bstatic\b[^"]*"',code) and not re.search(r'\bstatic\b',re.sub(r'"[^"]*"','',code)): continue
            rep='protected' if fn.search(code.split('=')[0]) else 'nosave'
            lines[i]=re.sub(r'\bstatic\b(?=\s)',rep,code,count=1)+l[len(code):]
            ch=True; n+=1
        if ch: open(p,'w',encoding='utf-8').write('\n'.join(lines))
print('changed',n)
