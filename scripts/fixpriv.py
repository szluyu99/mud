import os,re,sys
root=sys.argv[1]; n=0
for r,ds,fs in os.walk(root):
    for f in fs:
        if not f.endswith(".c"): continue
        p=os.path.join(r,f); s=open(p,encoding="utf-8").read()
        names=set(re.findall(r'(?:call_out|input_to|add_action|remove_call_out|find_call_out|call_other\s*\(\s*this_object\(\)\s*,)\s*\(\s*"(\w+)"',s))
        if not names: continue
        def rep(m):
            global n
            if m.group(3) in names: n+=1; return m.group(1)+m.group(2)
            return m.group(0)
        s2=re.sub(r'(^|\n)\s*private\s+((?:nomask\s+|varargs\s+)*[\w\*\s]*?\b(\w+)\s*\()',lambda m: rep(m) if m.group(3) in names else m.group(0),s)
        if s2!=s: open(p,"w",encoding="utf-8").write(s2)
print("unprivated",n)
